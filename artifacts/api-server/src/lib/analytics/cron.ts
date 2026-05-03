import { db, listingsTable, agentsTable, sellerReportsSentTable } from "@workspace/db";
import { and, eq, isNotNull } from "drizzle-orm";
import { logger } from "../logger.js";
import { enqueueEmail } from "../outbox/email.js";
import { resolveTimezone, getLocalWeekStart } from "./timezone.js";
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
    // The "current" local week (the one we're inside right now) starts
    // at Monday 00:00 local. The seller report summarises the *previous*
    // full week (last Monday 00:00 → this Monday 00:00) and is sent at
    // or after this Monday 8 AM local. seller_reports_sent dedupe keys
    // off the report's weekStart, so repeat ticks within the same week
    // are no-ops, and a missed 8 AM window (downtime, restart, deploy)
    // automatically catches up on the next tick during the same week.
    const currentWeekStart = getLocalWeekStart(now, tz);
    const eightAmLocalMs = currentWeekStart.getTime() + 8 * 60 * 60 * 1000;
    if (now.getTime() < eightAmLocalMs) continue;
    const reportWeekStart = new Date(currentWeekStart.getTime() - 7 * 24 * 60 * 60 * 1000);

    try {
      const sent = await sendWeeklyReportFor(listing, reportWeekStart);
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
  // Pre-flight: skip cleanly if we obviously can't render an email so
  // we don't claim the (listing, week) slot for a row we'd never send.
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

  // Claim and enqueue in one transaction so that any failure (DB blip,
  // outbox insert error, etc.) rolls back the claim and lets the next
  // tick retry. The unique index on (listing_id, week_start) makes the
  // claim race-safe; the transaction makes it retry-safe. `force: true`
  // (admin backfill) bypasses the claim check entirely.
  const enqueued = await db.transaction(async (tx) => {
    if (!opts.force) {
      const claimed = await tx
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
    await enqueueEmail(
      {
        toEmail: rendered.to,
        ccEmail: rendered.cc,
        subject: rendered.subject,
        html: rendered.html,
        textBody: rendered.text,
        kind: "weekly_seller_report",
        dedupeKey: `weekly_report:${listing.id}:${weekStart.toISOString().slice(0, 10)}`,
        // Admin backfill (force=true) bypasses both the
        // seller_reports_sent claim and the outbox dedupe collapse so
        // operators can genuinely re-send a previously-sent week.
        force: opts.force,
        metadata: {
          listingId: listing.id,
          weekStart: weekStart.toISOString(),
          backfilled: opts.force === true,
        },
      },
      tx,
    );
    return true;
  });
  if (!enqueued) return false;

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
  // Default 15-minute tick cadence so the actual send happens within
  // ±15 min of Monday 8:00 AM local, regardless of when the process
  // started. (Hourly ticks could drift the send time up to a full hour
  // depending on process-start time.) Override with WEEKLY_REPORT_TICK_MS.
  const intervalMs = Number(process.env.WEEKLY_REPORT_TICK_MS ?? 15 * 60 * 1000);
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
