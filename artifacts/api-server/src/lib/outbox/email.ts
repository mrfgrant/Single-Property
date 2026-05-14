import { db, emailOutboxTable, emailSuppressionsTable, listingsTable } from "@workspace/db";
import { eq, inArray, sql } from "drizzle-orm";
import { sendEmail } from "../email.js";
import { logger } from "../logger.js";

/**
 * Cold outreach is queued with a 15-minute delay; before actually
 * sending we re-check that the listing is still a viable cold-outreach
 * target. If it has since been activated by an agent (mode flips out of
 * preview, or agentId becomes set) or has gone off-market (status no
 * longer "active"), we cancel the queued message instead of sending it.
 *
 * Returns true if the row should be SUPPRESSED (do not send).
 */
/** Listings older than this are ineligible for cold outreach at send time. */
const LISTING_MAX_AGE_MS = 15 * 24 * 60 * 60 * 1000;


/**
 * Returns the best available on-market date for a listing.
 * Prefers mlsListDate (the real MLS list date). Falls back to createdAt
 * (the ingest timestamp) when mlsListDate is absent — callers must use a
 * tighter recency window in that case since createdAt lags the real date
 * by at most a few hours.
 */
function listingOnMarketDate(r: {
  mlsListDate: string | null;
  createdAt: Date | string;
}): { date: Date; verified: boolean } {
  if (r.mlsListDate) return { date: new Date(r.mlsListDate), verified: true };
  return { date: new Date(r.createdAt), verified: false };
}

async function shouldCancelColdOutreach(
  metadata: Record<string, unknown> | null,
): Promise<{ cancel: boolean; reason?: string }> {
  // Collect the set of listingIds attached to this outbox row. Modern
  // (digest) rows carry `listingIds` (array). Legacy single-listing
  // rows carry `listingId` (string). We accept either.
  const listingIds: string[] = [];
  if (metadata) {
    const arr = metadata.listingIds;
    if (Array.isArray(arr)) {
      for (const id of arr) if (typeof id === "string") listingIds.push(id);
    }
    const single = metadata.listingId;
    if (typeof single === "string") listingIds.push(single);
  }
  if (listingIds.length === 0) return { cancel: false };

  const rows = await db
    .select({
      id: listingsTable.id,
      mode: listingsTable.mode,
      status: listingsTable.status,
      agentId: listingsTable.agentId,
      purgedAt: listingsTable.purgedAt,
      mlsListDate: listingsTable.mlsListDate,
      createdAt: listingsTable.createdAt,
    })
    .from(listingsTable)
    .where(inArray(listingsTable.id, listingIds));

  const now = Date.now();

  // For the digest case, send if AT LEAST ONE referenced listing is
  // still a viable preview AND is within the 15-day recency window.
  // Only cancel when every listing has been activated, gone off-market,
  // been purged, vanished, or is too old.
  // Tighter recency window when falling back to createdAt (ingest timestamp).
  // mlsListDate is the real on-market date; createdAt may lag by hours at most.
  const FALLBACK_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

  const stillEligible = rows.filter((r) => {
    if (r.purgedAt || r.agentId || r.mode !== "preview" || r.status !== "active") return false;
    const { date, verified } = listingOnMarketDate(r);
    const maxAge = verified ? LISTING_MAX_AGE_MS : FALLBACK_MAX_AGE_MS;
    return now - date.getTime() <= maxAge;
  });
  if (stillEligible.length > 0) return { cancel: false };

  if (rows.length === 0) return { cancel: true, reason: "listing_deleted" };
  // Check if every listing is simply too old — most useful log reason.
  if (
    rows.every((r) => {
      const { date, verified } = listingOnMarketDate(r);
      const maxAge = verified ? LISTING_MAX_AGE_MS : FALLBACK_MAX_AGE_MS;
      return now - date.getTime() > maxAge;
    })
  ) {
    return { cancel: true, reason: "listing_too_old" };
  }
  // Pick a representative reason from the first row for the log.
  const r = rows[0]!;
  if (r.purgedAt) return { cancel: true, reason: "purged" };
  if (r.agentId) return { cancel: true, reason: "agent_activated" };
  if (r.mode !== "preview") return { cancel: true, reason: `mode_${r.mode}` };
  if (r.status !== "active") return { cancel: true, reason: `status_${r.status}` };
  return { cancel: true, reason: "ineligible" };
}

const log = logger.child({ component: "email-outbox" });

export interface EnqueueEmailParams {
  toEmail: string;
  /** Optional CC — agent on seller-facing reports, etc. */
  ccEmail?: string | null;
  subject: string;
  html: string;
  textBody?: string;
  kind:
    | "transactional"
    | "lead_alert"
    | "buyer_auto_reply"
    | "cold_outreach"
    | "weekly_seller_report"
    | "final_marketing_report"
    | string;
  dedupeKey?: string;
  sendAfter?: Date;
  metadata?: Record<string, unknown>;
  /**
   * Skip the dedupeKey collapse check and always insert a fresh outbox
   * row. Used by admin backfill endpoints that explicitly want to
   * re-send a previously-sent message (e.g. /admin/listings/:id/
   * weekly-report). The dedupeKey is still recorded on the new row for
   * traceability — uniqueness is not enforced at the DB level so this
   * is safe.
   */
  force?: boolean;
}

/**
 * Insert an email into the outbox. Idempotent on dedupeKey — if a row
 * already exists with the same key (and is not failed/cancelled), we
 * return that existing id and skip insert. The optional `tx` argument
 * lets callers participate in an outer transaction (e.g. `/leads`
 * enqueues two messages atomically with the lead row insert).
 */
export async function enqueueEmail(
  p: EnqueueEmailParams,
  tx: typeof db = db,
): Promise<string | null> {
  if (p.dedupeKey && !p.force) {
    const existing = await tx
      .select({ id: emailOutboxTable.id, status: emailOutboxTable.status })
      .from(emailOutboxTable)
      .where(eq(emailOutboxTable.dedupeKey, p.dedupeKey))
      .limit(1);
    if (existing[0] && existing[0].status !== "failed" && existing[0].status !== "cancelled") {
      return existing[0].id;
    }
  }
  const [row] = await tx
    .insert(emailOutboxTable)
    .values({
      toEmail: p.toEmail,
      ccEmail: p.ccEmail ?? null,
      subject: p.subject,
      html: p.html,
      textBody: p.textBody,
      kind: p.kind,
      dedupeKey: p.dedupeKey,
      sendAfter: p.sendAfter ?? new Date(),
      metadata: p.metadata,
    })
    .returning({ id: emailOutboxTable.id });
  return row?.id ?? null;
}

/**
 * Email kinds that respect the unsubscribe / suppression list.
 * Transactional + lead-alert + buyer auto-reply are critical and never
 * suppressed (the user expects them — payment receipts, lead notices,
 * inquiry confirmations). Marketing-style messages going to sellers or
 * cold prospects MUST honor unsubscribe.
 */
function isSuppressible(kind: string): boolean {
  return (
    kind === "cold_outreach" ||
    kind === "cold_outreach_followup" ||
    kind === "weekly_seller_report" ||
    kind === "final_marketing_report"
  );
}

async function isAddressSuppressed(email: string): Promise<boolean> {
  const sup = await db
    .select({ email: emailSuppressionsTable.email })
    .from(emailSuppressionsTable)
    .where(eq(emailSuppressionsTable.email, email))
    .limit(1);
  return sup.length > 0;
}

/**
 * Drain up to `limit` due emails. Each row is processed in its own
 * transaction-equivalent: we set status=sending optimistically, send,
 * then mark sent or failed-with-backoff.
 */
export async function drainEmailOutbox(limit = 25): Promise<{ processed: number }> {
  // db.execute() with raw SQL RETURNING * gives back snake_case column names
  // (e.g. `to_email`, `max_attempts`) while the Drizzle ORM query builder
  // produces camelCase. This normalizer handles both so the drain loop can
  // access properties by their camelCase ORM names regardless of which path
  // produced the row.
  function normalizeRow(raw: unknown): typeof emailOutboxTable.$inferSelect {
    const r = raw as Record<string, unknown>;
    return {
      id:                r.id,
      toEmail:           r.toEmail           ?? r.to_email,
      ccEmail:           r.ccEmail           ?? r.cc_email           ?? null,
      subject:           r.subject,
      html:              r.html,
      textBody:          r.textBody          ?? r.text_body          ?? null,
      kind:              r.kind,
      dedupeKey:         r.dedupeKey         ?? r.dedupe_key         ?? null,
      status:            r.status,
      attempts:          r.attempts,
      maxAttempts:       r.maxAttempts       ?? r.max_attempts,
      sendAfter:         r.sendAfter         ?? r.send_after,
      sentAt:            r.sentAt            ?? r.sent_at            ?? null,
      failedAt:          r.failedAt          ?? r.failed_at          ?? null,
      lastError:         r.lastError         ?? r.last_error         ?? null,
      providerMessageId: r.providerMessageId ?? r.provider_message_id ?? null,
      metadata:          r.metadata          ?? null,
      createdAt:         r.createdAt         ?? r.created_at,
      updatedAt:         r.updatedAt         ?? r.updated_at,
    } as typeof emailOutboxTable.$inferSelect;
  }

  // Helper to normalize the two result shapes Drizzle can return from
  // db.execute (driver-dependent: either `.rows` array or bare array),
  // and apply the snake_case → camelCase normalizer to every row.
  const extractRows = (
    r: unknown,
  ): Array<typeof emailOutboxTable.$inferSelect> => {
    const raw: unknown[] =
      (r as { rows?: unknown[] }).rows ?? (r as unknown[]);
    return raw.map(normalizeRow);
  };

  // Claim up to `limit` due rows — all kinds, no daily cap.
  const claimed = await db.execute<typeof emailOutboxTable.$inferSelect>(sql`
    UPDATE ${emailOutboxTable}
       SET status = 'sending', updated_at = NOW()
     WHERE id IN (
       SELECT id FROM ${emailOutboxTable}
        WHERE status = 'pending' AND send_after <= NOW()
        ORDER BY send_after ASC
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
     )
     RETURNING *
  `);

  const due = extractRows(claimed);

  let processed = 0;
  for (const row of due) {
    processed++;
    // Suppression check for marketing-style kinds. If the primary
    // recipient unsubscribed we drop the row entirely; if only the CC
    // unsubscribed we strip the CC and still send to the primary so the
    // seller still gets their report even when the agent has opted out.
    let effectiveCc: string | null = row.ccEmail ?? null;
    if (isSuppressible(row.kind)) {
      if (await isAddressSuppressed(row.toEmail)) {
        await db
          .update(emailOutboxTable)
          .set({ status: "suppressed", updatedAt: new Date() })
          .where(eq(emailOutboxTable.id, row.id));
        log.info({ outboxId: row.id, kind: row.kind }, "Email suppressed");
        continue;
      }
      if (effectiveCc && (await isAddressSuppressed(effectiveCc))) {
        log.info(
          { outboxId: row.id, kind: row.kind },
          "CC recipient suppressed — sending to primary only",
        );
        effectiveCc = null;
      }
    }
    if (row.kind === "cold_outreach" || row.kind === "cold_outreach_followup") {
      // Pre-send listing-state guard for cold outreach: if the listing
      // has since been activated, gone off-market, or been deleted, do
      // not blast the agent — they may have already paid us, or the
      // property is no longer relevant.
      const guard = await shouldCancelColdOutreach(
        row.metadata as Record<string, unknown> | null,
      );
      if (guard.cancel) {
        await db
          .update(emailOutboxTable)
          .set({ status: "cancelled", lastError: guard.reason ?? null, updatedAt: new Date() })
          .where(eq(emailOutboxTable.id, row.id));
        log.info(
          { outboxId: row.id, reason: guard.reason },
          "Cold outreach email cancelled — listing no longer eligible",
        );
        continue;
      }
    }
    try {
      const result = await sendEmail({
        to: row.toEmail,
        cc: effectiveCc,
        subject: row.subject,
        html: row.html,
        text: row.textBody ?? undefined,
      });
      await db
        .update(emailOutboxTable)
        .set({
          status: "sent",
          sentAt: new Date(),
          providerMessageId: result?.providerMessageId ?? null,
          updatedAt: new Date(),
        })
        .where(eq(emailOutboxTable.id, row.id));
      // Stay well under Resend's 5 req/s rate limit.
      await new Promise((resolve) => setTimeout(resolve, 220));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const nextAttempts = row.attempts + 1;
      const failed = nextAttempts >= row.maxAttempts;
      const backoffMs = Math.min(60_000 * Math.pow(2, nextAttempts), 6 * 60 * 60 * 1000);
      await db
        .update(emailOutboxTable)
        .set({
          // Re-queue as pending (not 'sending') so the next tick can claim it.
          status: failed ? "failed" : "pending",
          attempts: nextAttempts,
          lastError: msg.slice(0, 500),
          failedAt: failed ? new Date() : null,
          sendAfter: failed ? row.sendAfter : new Date(Date.now() + backoffMs),
          updatedAt: new Date(),
        })
        .where(eq(emailOutboxTable.id, row.id));
      log.warn({ outboxId: row.id, attempts: nextAttempts, failed, err: msg }, "Email send failed");
    }
  }
  return { processed };
}

/**
 * Recover rows stuck in 'sending' for more than 10 minutes — typically
 * the result of a process crash mid-send. Resets them to pending so the
 * next tick can re-attempt (idempotent: we use dedupeKey + provider
 * idempotency where available).
 */
async function recoverStuckSends(): Promise<void> {
  await db.execute(sql`
    UPDATE ${emailOutboxTable}
       SET status = 'pending', updated_at = NOW()
     WHERE status = 'sending' AND updated_at < NOW() - INTERVAL '10 minutes'
  `);
}

/**
 * Cancel all pending cold_outreach email rows.
 * Called on boot before the worker starts to wipe any queued cold outreach.
 */
export async function cancelAllPendingColdOutreachEmail(): Promise<number> {
  const result = await db.execute<{ id: string }>(sql`
    UPDATE ${emailOutboxTable}
       SET status = 'cancelled', updated_at = NOW()
     WHERE status IN ('pending', 'sending')
       AND kind = 'cold_outreach'
    RETURNING id
  `);
  const rows =
    (result as unknown as { rows: unknown[] }).rows ??
    (result as unknown as unknown[]);
  const count = rows.length;
  if (count > 0) {
    log.warn({ count }, "Boot-time cancel: wiped pending cold_outreach emails from outbox");
  }
  return count;
}

let timer: NodeJS.Timeout | null = null;

/**
 * Start the outbox dispatcher loop. Idempotent — calling twice is a no-op.
 */
export function startEmailOutboxWorker(intervalMs = 15_000): void {
  if (timer) return;
  log.info({ intervalMs }, "Email outbox worker started");
  const tick = async () => {
    // recoverStuckSends has its own try/catch so a transient DB timeout
    // cannot prevent drainEmailOutbox from running in the same tick.
    try {
      await recoverStuckSends();
    } catch (err) {
      log.warn({ err }, "recoverStuckSends failed — skipping this cycle");
    }
    try {
      await drainEmailOutbox();
    } catch (err) {
      log.error({ err }, "drainEmailOutbox tick threw");
    }
  };
  timer = setInterval(tick, intervalMs);
  // unref so test runs and graceful shutdown aren't blocked.
  if (typeof timer.unref === "function") timer.unref();
  // Fire once immediately so we don't wait `intervalMs` on first boot.
  void tick();
}
