import {
  db,
  listingsTable,
  agentsTable,
  emailOutboxTable,
  emailSuppressionsTable,
} from "@workspace/db";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { logger } from "../logger.js";
import { enqueueEmail } from "../outbox/email.js";
import { coldOutreachFollowupEmail } from "../email.js";
import { buildUnsubscribeUrl } from "./unsubscribe.js";
import { nextSendWindow7to9amET } from "./sendWindow.js";

const log = logger.child({ component: "cold-outreach-followup" });

const MARKETING_SITE_URL =
  process.env.MARKETING_SITE_URL ?? process.env.PLATFORM_HOMEPAGE_URL ?? "https://app.propsite.io";

const FOLLOWUP_AGE_DAYS = Number(process.env.COLD_OUTREACH_FOLLOWUP_DAYS ?? 5);
const TICK_MS = Number(process.env.COLD_OUTREACH_FOLLOWUP_TICK_MS ?? 6 * 60 * 60 * 1000); // every 6h

/**
 * Find every initial cold-outreach digest sent ~5 days ago whose
 * recipient still hasn't signed up and hasn't unsubscribed, and queue a
 * single follow-up nudge per recipient. Idempotent on the recipient
 * email — if a follow-up was ever queued (by dedupe key), no second one
 * is created. Each agent therefore receives at most one follow-up,
 * forever, regardless of how many listings they had.
 */
async function runOneTick(): Promise<{ enqueued: number }> {
  // Eligibility window: the original digest was sent strictly more
  // than FOLLOWUP_AGE_DAYS ago and not absurdly old (we don't want to
  // suddenly nudge every old contact if this cron has been off for a
  // month). Using a 30-day upper bound is safe here.
  const ageDays = FOLLOWUP_AGE_DAYS;
  const sentRows = await db.execute<{
    id: string;
    to_email: string;
    metadata: Record<string, unknown> | null;
  }>(sql`
    SELECT id, to_email, metadata
      FROM ${emailOutboxTable}
     WHERE kind = 'cold_outreach'
       AND status = 'sent'
       AND sent_at < NOW() - (${ageDays}::int * INTERVAL '1 day')
       AND sent_at > NOW() - INTERVAL '30 days'
  `);
  const candidates =
    (sentRows as unknown as { rows: Array<{ id: string; to_email: string; metadata: Record<string, unknown> | null }> })
      .rows ??
    (sentRows as unknown as Array<{ id: string; to_email: string; metadata: Record<string, unknown> | null }>);

  if (candidates.length === 0) return { enqueued: 0 };

  let enqueued = 0;

  for (const row of candidates) {
    const recipient = row.to_email.toLowerCase();
    const followupDedupe = `cold_outreach_followup:agent:${recipient}`;

    // Already queued/sent? Skip.
    const exists = await db
      .select({ id: emailOutboxTable.id })
      .from(emailOutboxTable)
      .where(eq(emailOutboxTable.dedupeKey, followupDedupe))
      .limit(1);
    if (exists[0]) continue;

    // Did they sign up since the original send?
    const signedUp = await db
      .select({ id: agentsTable.id })
      .from(agentsTable)
      .where(eq(agentsTable.email, recipient))
      .limit(1);
    if (signedUp[0]) continue;

    // Did they unsubscribe?
    const unsub = await db
      .select({ email: emailSuppressionsTable.email })
      .from(emailSuppressionsTable)
      .where(eq(emailSuppressionsTable.email, recipient))
      .limit(1);
    if (unsub[0]) continue;

    // Find a representative listing from the original digest that's
    // still a viable preview to nudge them about. If none of them are
    // eligible anymore (all activated by someone else, all closed, all
    // purged), skip — the agent has clearly moved past this moment.
    const meta = (row.metadata ?? {}) as Record<string, unknown>;
    const ids = Array.isArray(meta.listingIds)
      ? (meta.listingIds.filter((x) => typeof x === "string") as string[])
      : [];
    if (ids.length === 0) continue;

    const eligible = await db
      .select()
      .from(listingsTable)
      .where(
        and(
          inArray(listingsTable.id, ids),
          isNull(listingsTable.agentId),
          isNull(listingsTable.purgedAt),
          eq(listingsTable.mode, "preview"),
          eq(listingsTable.status, "active"),
        ),
      )
      .limit(1);
    if (!eligible[0]) continue;
    const listing = eligible[0];

    const rendered = coldOutreachFollowupEmail({
      agentEmail: recipient,
      agentFirstName: firstNameOf(listing.listAgentName),
      primaryAddress: listing.address,
      primaryPreviewUrl: `${MARKETING_SITE_URL}/listing/${listing.id}`,
      unsubscribeUrl: buildUnsubscribeUrl(MARKETING_SITE_URL, recipient),
    });

    try {
      await enqueueEmail({
        toEmail: recipient,
        kind: "cold_outreach_followup",
        subject: rendered.subject,
        html: rendered.html,
        textBody: rendered.text,
        dedupeKey: followupDedupe,
        sendAfter: nextSendWindow7to9amET(),
        metadata: {
          listingIds: [listing.id],
          agentEmail: recipient,
          originalOutboxId: row.id,
        },
      });
      enqueued += 1;
    } catch (err) {
      log.error({ err, recipient }, "Failed to enqueue cold-outreach follow-up");
    }
  }
  if (enqueued > 0) log.info({ enqueued }, "Cold-outreach follow-ups queued");
  return { enqueued };
}

function firstNameOf(full: string | null | undefined): string {
  if (!full) return "there";
  return full.trim().split(/\s+/)[0] || "there";
}

let timer: NodeJS.Timeout | null = null;

export function startColdOutreachFollowupCron(): void {
  if (timer) return;
  if (process.env.COLD_OUTREACH_FOLLOWUP_DISABLED === "1") {
    log.info("Cold-outreach follow-up cron disabled via env");
    return;
  }
  log.info({ tickMs: TICK_MS, ageDays: FOLLOWUP_AGE_DAYS }, "Cold-outreach follow-up cron started");
  const tick = () =>
    runOneTick().catch((err) => log.error({ err }, "Follow-up tick threw"));
  timer = setInterval(tick, TICK_MS);
  if (typeof timer.unref === "function") timer.unref();
  void tick();
}

export function stopColdOutreachFollowupCron(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

/** Exported for tests / manual ops. */
export const __runFollowupTickForTest = runOneTick;
