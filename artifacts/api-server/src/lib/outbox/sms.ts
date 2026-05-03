import { db, smsOutboxTable, smsSuppressionsTable, agentsTable, listingsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { sendSms, lookupNumber } from "../telnyx/client.js";
import { logger } from "../logger.js";

/**
 * Mirror of the email outbox cold-outreach guard. See email.ts for why.
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

const log = logger.child({ component: "sms-outbox" });

export interface EnqueueSmsParams {
  toPhone: string; // E.164
  body: string;
  kind?: "cold_outreach" | "transactional";
  dedupeKey?: string;
  sendAfter?: Date;
  metadata?: Record<string, unknown>;
}

export async function enqueueSms(p: EnqueueSmsParams): Promise<string | null> {
  if (p.dedupeKey) {
    const existing = await db
      .select({ id: smsOutboxTable.id, status: smsOutboxTable.status })
      .from(smsOutboxTable)
      .where(eq(smsOutboxTable.dedupeKey, p.dedupeKey))
      .limit(1);
    if (existing[0] && existing[0].status !== "failed" && existing[0].status !== "cancelled") {
      return existing[0].id;
    }
  }
  const [row] = await db
    .insert(smsOutboxTable)
    .values({
      toPhone: p.toPhone,
      body: p.body,
      kind: p.kind ?? "cold_outreach",
      dedupeKey: p.dedupeKey,
      sendAfter: p.sendAfter ?? new Date(),
      metadata: p.metadata,
    })
    .returning({ id: smsOutboxTable.id });
  return row?.id ?? null;
}

/**
 * For each due SMS:
 *   1. Check sms_suppressions — if hit, mark suppressed.
 *   2. Look up the agent by phone (best-effort) and check `smsEligible`.
 *      If null, run Telnyx Number Lookup; cache result; if landline,
 *      mark suppressed permanently (we never want to text again).
 *   3. Send via Telnyx, record provider message id, retry on failure.
 */
export async function drainSmsOutbox(limit = 25): Promise<{ processed: number }> {
  // Atomic claim — see email outbox for rationale.
  const claimed = await db.execute<typeof smsOutboxTable.$inferSelect>(sql`
    UPDATE ${smsOutboxTable}
       SET status = 'sending', updated_at = NOW()
     WHERE id IN (
       SELECT id FROM ${smsOutboxTable}
        WHERE status = 'pending' AND send_after <= NOW()
        ORDER BY send_after ASC
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
     )
     RETURNING *
  `);
  const due = (claimed as unknown as { rows: Array<typeof smsOutboxTable.$inferSelect> })
    .rows ?? (claimed as unknown as Array<typeof smsOutboxTable.$inferSelect>);

  let processed = 0;
  for (const row of due) {
    processed++;

    // 1. Suppression check (TCPA-critical).
    const sup = await db
      .select({ phone: smsSuppressionsTable.phone })
      .from(smsSuppressionsTable)
      .where(eq(smsSuppressionsTable.phone, row.toPhone))
      .limit(1);
    if (sup[0]) {
      await db
        .update(smsOutboxTable)
        .set({ status: "suppressed", updatedAt: new Date() })
        .where(eq(smsOutboxTable.id, row.id));
      log.info({ outboxId: row.id }, "SMS suppressed (STOP on file)");
      continue;
    }

    // 1b. Cold outreach pre-send guard: cancel if the underlying listing
    // is no longer eligible (agent activated, off-market, or deleted).
    if (row.kind === "cold_outreach") {
      const guard = await shouldCancelColdOutreach(
        row.metadata as Record<string, unknown> | null,
      );
      if (guard.cancel) {
        await db
          .update(smsOutboxTable)
          .set({ status: "cancelled", lastError: guard.reason ?? null, updatedAt: new Date() })
          .where(eq(smsOutboxTable.id, row.id));
        log.info(
          { outboxId: row.id, reason: guard.reason },
          "Cold outreach SMS cancelled — listing no longer eligible",
        );
        continue;
      }
    }

    // 2. Mobile/landline check via Telnyx Number Lookup, cached on agent.
    //    Also: respect any agent-level unsubscribe (set by the email
    //    unsubscribe endpoint or admin tooling) — we treat
    //    `agent.unsubscribedAt` as a global "leave me alone" flag that
    //    blocks both email and SMS, even if no STOP reply was received.
    const agents = await db
      .select()
      .from(agentsTable)
      .where(eq(agentsTable.phone, row.toPhone))
      .limit(1);
    const agent = agents[0];
    if (agent?.unsubscribedAt) {
      await db
        .update(smsOutboxTable)
        .set({ status: "suppressed", updatedAt: new Date() })
        .where(eq(smsOutboxTable.id, row.id));
      log.info({ outboxId: row.id, agentId: agent.id }, "SMS suppressed (agent unsubscribed)");
      continue;
    }
    let eligible = agent?.smsEligible ?? null;
    if (eligible === null && process.env.TELNYX_API_KEY) {
      try {
        const carrier = await lookupNumber(row.toPhone);
        eligible = carrier === "mobile" || carrier === "voip";
        if (agent) {
          await db
            .update(agentsTable)
            .set({ smsEligible: eligible, updatedAt: new Date() })
            .where(eq(agentsTable.id, agent.id));
        }
      } catch (err) {
        log.warn({ err, phone: row.toPhone }, "Telnyx lookup failed — skipping SMS this tick");
        // Don't burn an attempt on infra error; defer 5 min and retry.
        await db
          .update(smsOutboxTable)
          .set({ sendAfter: new Date(Date.now() + 5 * 60_000), updatedAt: new Date() })
          .where(eq(smsOutboxTable.id, row.id));
        continue;
      }
    }
    if (eligible === false) {
      await db
        .update(smsOutboxTable)
        .set({ status: "suppressed", updatedAt: new Date() })
        .where(eq(smsOutboxTable.id, row.id));
      log.info({ outboxId: row.id }, "SMS suppressed (landline / not SMS-capable)");
      continue;
    }

    // 3. Send.
    try {
      const result = await sendSms({ to: row.toPhone, text: row.body });
      await db
        .update(smsOutboxTable)
        .set({
          status: "sent",
          sentAt: new Date(),
          providerMessageId: result.providerMessageId,
          updatedAt: new Date(),
        })
        .where(eq(smsOutboxTable.id, row.id));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const nextAttempts = row.attempts + 1;
      const failed = nextAttempts >= row.maxAttempts;
      const backoffMs = Math.min(60_000 * Math.pow(2, nextAttempts), 60 * 60 * 1000);
      await db
        .update(smsOutboxTable)
        .set({
          status: failed ? "failed" : "pending",
          attempts: nextAttempts,
          lastError: msg.slice(0, 500),
          failedAt: failed ? new Date() : null,
          sendAfter: failed ? row.sendAfter : new Date(Date.now() + backoffMs),
          updatedAt: new Date(),
        })
        .where(eq(smsOutboxTable.id, row.id));
      log.warn({ outboxId: row.id, attempts: nextAttempts, failed, err: msg }, "SMS send failed");
    }
  }
  return { processed };
}

async function recoverStuckSends(): Promise<void> {
  await db.execute(sql`
    UPDATE ${smsOutboxTable}
       SET status = 'pending', updated_at = NOW()
     WHERE status = 'sending' AND updated_at < NOW() - INTERVAL '10 minutes'
  `);
}

let timer: NodeJS.Timeout | null = null;
export function startSmsOutboxWorker(intervalMs = 15_000): void {
  if (timer) return;
  log.info({ intervalMs }, "SMS outbox worker started");
  const tick = async () => {
    try {
      await recoverStuckSends();
      await drainSmsOutbox();
    } catch (err) {
      log.error({ err }, "SMS outbox tick threw");
    }
  };
  timer = setInterval(tick, intervalMs);
  if (typeof timer.unref === "function") timer.unref();
  void tick();
}
