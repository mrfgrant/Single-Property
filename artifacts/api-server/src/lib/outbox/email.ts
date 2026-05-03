import { db, emailOutboxTable, emailSuppressionsTable, listingsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
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
async function shouldCancelColdOutreach(
  metadata: Record<string, unknown> | null,
): Promise<{ cancel: boolean; reason?: string }> {
  const listingId = metadata && typeof metadata.listingId === "string" ? metadata.listingId : null;
  if (!listingId) return { cancel: false };
  const rows = await db
    .select({
      mode: listingsTable.mode,
      status: listingsTable.status,
      agentId: listingsTable.agentId,
    })
    .from(listingsTable)
    .where(eq(listingsTable.id, listingId))
    .limit(1);
  const listing = rows[0];
  if (!listing) return { cancel: true, reason: "listing_deleted" };
  if (listing.agentId) return { cancel: true, reason: "agent_activated" };
  if (listing.mode !== "preview") return { cancel: true, reason: `mode_${listing.mode}` };
  if (listing.status !== "active") return { cancel: true, reason: `status_${listing.status}` };
  return { cancel: false };
}

const log = logger.child({ component: "email-outbox" });

export interface EnqueueEmailParams {
  toEmail: string;
  subject: string;
  html: string;
  textBody?: string;
  kind: "transactional" | "lead_alert" | "buyer_auto_reply" | "cold_outreach" | string;
  dedupeKey?: string;
  sendAfter?: Date;
  metadata?: Record<string, unknown>;
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
  if (p.dedupeKey) {
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

/** Cold outreach is suppressible; transactional is not. */
function isSuppressible(kind: string): boolean {
  return kind === "cold_outreach";
}

/**
 * Drain up to `limit` due emails. Each row is processed in its own
 * transaction-equivalent: we set status=sending optimistically, send,
 * then mark sent or failed-with-backoff.
 */
export async function drainEmailOutbox(limit = 25): Promise<{ processed: number }> {
  // ATOMIC CLAIM: flip pending → sending in a single UPDATE so concurrent
  // workers (or overlapping ticks) cannot select the same rows. Postgres
  // FOR UPDATE SKIP LOCKED guarantees the inner SELECT only returns rows
  // we can lock; the outer UPDATE then mutates them and RETURNs the
  // claimed payload. After this call, no other worker will see these rows
  // as pending.
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
  const due = (claimed as unknown as { rows: Array<typeof emailOutboxTable.$inferSelect> })
    .rows ?? (claimed as unknown as Array<typeof emailOutboxTable.$inferSelect>);

  let processed = 0;
  for (const row of due) {
    processed++;
    // Suppression check (cold_outreach only).
    if (isSuppressible(row.kind)) {
      const sup = await db
        .select({ email: emailSuppressionsTable.email })
        .from(emailSuppressionsTable)
        .where(eq(emailSuppressionsTable.email, row.toEmail))
        .limit(1);
      if (sup[0]) {
        await db
          .update(emailOutboxTable)
          .set({ status: "suppressed", updatedAt: new Date() })
          .where(eq(emailOutboxTable.id, row.id));
        log.info({ outboxId: row.id, kind: row.kind }, "Email suppressed");
        continue;
      }
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

let timer: NodeJS.Timeout | null = null;

/**
 * Start the outbox dispatcher loop. Idempotent — calling twice is a no-op.
 */
export function startEmailOutboxWorker(intervalMs = 15_000): void {
  if (timer) return;
  log.info({ intervalMs }, "Email outbox worker started");
  const tick = async () => {
    try {
      await recoverStuckSends();
      await drainEmailOutbox();
    } catch (err) {
      log.error({ err }, "Email outbox tick threw");
    }
  };
  timer = setInterval(tick, intervalMs);
  // unref so test runs and graceful shutdown aren't blocked.
  if (typeof timer.unref === "function") timer.unref();
  // Fire once immediately so we don't wait `intervalMs` on first boot.
  void tick();
}
