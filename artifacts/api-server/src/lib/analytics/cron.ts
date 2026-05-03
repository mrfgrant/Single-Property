import { db, listingsTable, agentsTable, sellerReportsSentTable } from "@workspace/db";
import { and, eq, isNotNull } from "drizzle-orm";
import { logger } from "../logger.js";
import { enqueueEmail } from "../outbox/email.js";
import { resolveTimezone, getLocalParts, getLocalWeekStart } from "./timezone.js";
import { getWeeklyStats, buildNarrative } from "./aggregate.js";
import { renderWeeklySellerReport } from "./report.js";

const log = logger.child({ component: "weekly-report" });

/**
 * The hourly tick walks every live listing and asks "is it currently
 * Monday 8am in this listing's local timezone?". If yes, and we haven't
 * already sent this week's report, enqueue one. The unique constraint
 * (listing_id, week_start) on seller_reports_sent makes the enqueue
 * idempotent across overlapping ticks and process restarts.
 */
async function runOneTick(now: Date = new Date()): Promise<{ enqueued: number }> {
  const liveListings = await db
    .select()
    .from(listingsTable)
    .where(and(eq(listingsTable.mode, "live"), eq(listingsTable.status, "active")));

  let enqueued = 0;

  for (const listing of liveListings) {
    const tz = resolveTimezone(listing.zip ?? null);
    const local = getLocalParts(now, tz);
    // Monday (dayOfWeek=1) at 8 AM local. We deliberately do NOT scope
    // to a single tick — if the server was down at 8am the next tick
    // (within the same local hour or even the next morning) will catch
    // it because the dedupe is by week, not by minute.
    const isReportWindow = local.dayOfWeek === 1 && local.hour === 8;
    if (!isReportWindow) continue;

    const weekStart = getLocalWeekStart(now, tz);
    // Bound the window to this week — if we missed Monday for whatever
    // reason, we don't want to spam an old week's data.
    if (weekStart.getTime() > now.getTime()) continue;

    try {
      const sent = await sendWeeklyReportFor(listing, weekStart);
      if (sent) enqueued += 1;
    } catch (err) {
      log.error({ err, listingId: listing.id }, "Failed to send weekly report for listing");
    }
  }

  return { enqueued };
}

type Listing = typeof listingsTable.$inferSelect;

async function sendWeeklyReportFor(
  listing: Listing,
  weekStart: Date,
  opts: { force?: boolean } = {},
): Promise<boolean> {
  // Atomically claim the (listing, week) slot BEFORE doing any work.
  // INSERT ... ON CONFLICT DO NOTHING RETURNING returns the inserted row
  // only for the winner of a race; concurrent callers get an empty array
  // and bail out without enqueuing duplicate email. The unique index on
  // (listing_id, week_start) is what makes this race-safe.
  if (!opts.force) {
    const claimed = await db
      .insert(sellerReportsSentTable)
      .values({ listingId: listing.id, weekStart, sentAt: new Date() })
      .onConflictDoNothing()
      .returning({ id: sellerReportsSentTable.id });
    if (claimed.length === 0) {
      log.debug(
        { listingId: listing.id, weekStart },
        "Weekly report already claimed by another worker — skipping",
      );
      return false;
    }
  }

  if (!listing.agentId) {
    log.warn({ listingId: listing.id }, "Live listing has no agent — cannot send weekly report");
    return false;
  }

  const agentRows = await db
    .select()
    .from(agentsTable)
    .where(eq(agentsTable.id, listing.agentId))
    .limit(1);
  const agent = agentRows[0];
  if (!agent) {
    log.warn({ listingId: listing.id, agentId: listing.agentId }, "Agent not found");
    return false;
  }

  const stats = await getWeeklyStats(listing.id, weekStart);
  const narrative = buildNarrative(stats);

  const sellerEmail = listing.sellerEmail?.trim() || null;
  const isAgentOnly = !sellerEmail;
  const recipientName = sellerEmail ? "there" : agent.firstName;

  const rendered = renderWeeklySellerReport({
    toEmail: sellerEmail ?? agent.email,
    ccEmail: sellerEmail ? agent.email : null,
    recipientName,
    isAgentOnly,
    address: listing.address,
    domainName: listing.domainName ?? null,
    agentFirstName: agent.firstName,
    agentLastName: agent.lastName,
    agentEmail: agent.email,
    agentPhone: agent.phone ?? null,
    agentHeadshotUrl: agent.headshotUrl ?? null,
    brokerage: agent.brokerage ?? null,
    stats,
    narrative,
  });

  // We've already claimed the slot above — enqueue the email last so
  // that if anything below the claim fails the operator can manually
  // delete the seller_reports_sent row and retry. (`force: true` from
  // the admin backfill route bypasses the claim check entirely.)
  await enqueueEmail({
    toEmail: rendered.to,
    ccEmail: rendered.cc,
    subject: rendered.subject,
    html: rendered.html,
    textBody: rendered.text,
    kind: "weekly_seller_report",
    dedupeKey: `weekly_report:${listing.id}:${weekStart.toISOString().slice(0, 10)}`,
    metadata: {
      listingId: listing.id,
      weekStart: weekStart.toISOString(),
    },
  });

  log.info(
    {
      listingId: listing.id,
      weekStart,
      visits: stats.visits,
      leads: stats.leads,
      isAgentOnly,
    },
    "Weekly seller report enqueued",
  );
  return true;
}

let timer: NodeJS.Timeout | null = null;

/**
 * Hourly tick — fires roughly on the hour (we let setInterval drift;
 * since dedupe is per-week, drift is harmless). The first tick runs
 * immediately so dev/restart doesn't have to wait an hour.
 */
export function startWeeklyReportCron(): void {
  if (timer) return;
  if (process.env.WEEKLY_REPORT_CRON_DISABLED === "1") {
    log.info("Weekly report cron disabled via WEEKLY_REPORT_CRON_DISABLED=1");
    return;
  }
  const intervalMs = Number(process.env.WEEKLY_REPORT_TICK_MS ?? 60 * 60 * 1000);
  const tick = () =>
    runOneTick().catch((err) => log.error({ err }, "Weekly report tick errored"));
  timer = setInterval(tick, intervalMs);
  if (typeof timer.unref === "function") timer.unref();
  log.info({ intervalMs }, "Weekly seller report cron started");
  // Fire once immediately so a Monday-morning restart doesn't miss the
  // 8am window. seller_reports_sent dedupe makes this safe.
  void tick();
}

export function stopWeeklyReportCron(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

/** Operator backfill — re-send a specific week for a listing on demand. */
export async function backfillWeeklyReport(
  listingId: string,
  weekStartIso?: string,
): Promise<{ sent: boolean; weekStart: string; reason?: string }> {
  const rows = await db
    .select()
    .from(listingsTable)
    .where(eq(listingsTable.id, listingId))
    .limit(1);
  const listing = rows[0];
  if (!listing) return { sent: false, weekStart: "", reason: "listing_not_found" };

  const tz = resolveTimezone(listing.zip ?? null);
  const weekStart = weekStartIso
    ? new Date(weekStartIso)
    : getLocalWeekStart(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), tz);

  if (Number.isNaN(weekStart.getTime())) {
    return { sent: false, weekStart: "", reason: "invalid_weekStart" };
  }

  const sent = await sendWeeklyReportFor(listing, weekStart, { force: true });
  return { sent, weekStart: weekStart.toISOString() };
}
