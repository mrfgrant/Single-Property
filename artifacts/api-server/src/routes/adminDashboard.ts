import { Router } from "express";
import { db, emailOutboxTable, emailClickEventsTable, listingsTable, mlsSyncStateTable, agentsTable } from "@workspace/db";
import { sql } from "drizzle-orm";
import { adminAuth } from "../middleware/adminAuth.js";
import { logger } from "../lib/logger.js";

const log = logger.child({ component: "admin-dashboard" });
const router = Router();

router.get("/admin/dashboard", adminAuth, async (_req, res) => {
  try {
    const [outreach, clicks, revenue, mls, dailySent] = await Promise.all([
      // Cold outreach email funnel
      db.execute<{
        sent_today: string; sent_7d: string; sent_30d: string;
        pending: string; failed: string; cancelled: string; suppressed: string;
      }>(sql`
        SELECT
          COUNT(*) FILTER (WHERE kind = 'cold_outreach' AND status = 'sent'
            AND sent_at >= (CURRENT_TIMESTAMP AT TIME ZONE 'America/New_York')::date)
            AS sent_today,
          COUNT(*) FILTER (WHERE kind = 'cold_outreach' AND status = 'sent'
            AND sent_at >= (CURRENT_TIMESTAMP AT TIME ZONE 'America/New_York')::date - 6)
            AS sent_7d,
          COUNT(*) FILTER (WHERE kind = 'cold_outreach' AND status = 'sent'
            AND sent_at >= (CURRENT_TIMESTAMP AT TIME ZONE 'America/New_York')::date - 29)
            AS sent_30d,
          COUNT(*) FILTER (WHERE kind = 'cold_outreach' AND status = 'pending') AS pending,
          COUNT(*) FILTER (WHERE kind = 'cold_outreach' AND status = 'failed')  AS failed,
          COUNT(*) FILTER (WHERE kind = 'cold_outreach' AND status = 'cancelled') AS cancelled,
          COUNT(*) FILTER (WHERE kind = 'cold_outreach' AND status = 'suppressed') AS suppressed
        FROM ${emailOutboxTable}
      `),

      // Click-throughs from outreach emails
      db.execute<{
        clicks_today: string; clicks_7d: string; unique_agents_7d: string;
        activate_clicks_7d: string;
      }>(sql`
        SELECT
          COUNT(*) FILTER (WHERE clicked_at IS NOT NULL
            AND clicked_at >= (CURRENT_TIMESTAMP AT TIME ZONE 'America/New_York')::date)
            AS clicks_today,
          COUNT(*) FILTER (WHERE clicked_at IS NOT NULL
            AND clicked_at >= (CURRENT_TIMESTAMP AT TIME ZONE 'America/New_York')::date - 6)
            AS clicks_7d,
          COUNT(DISTINCT agent_email) FILTER (WHERE clicked_at IS NOT NULL
            AND clicked_at >= (CURRENT_TIMESTAMP AT TIME ZONE 'America/New_York')::date - 6)
            AS unique_agents_7d,
          COUNT(*) FILTER (WHERE link_type = 'activate' AND clicked_at IS NOT NULL
            AND clicked_at >= (CURRENT_TIMESTAMP AT TIME ZONE 'America/New_York')::date - 6)
            AS activate_clicks_7d
        FROM ${emailClickEventsTable}
      `),

      // Revenue pipeline
      db.execute<{
        paid_active: string; claimed_trial: string;
        total_mls_listings: string; new_listings_7d: string;
        total_agents: string;
      }>(sql`
        SELECT
          COUNT(*) FILTER (WHERE stripe_subscription_id IS NOT NULL AND mode = 'live') AS paid_active,
          COUNT(*) FILTER (WHERE agent_id IS NOT NULL AND mode = 'preview')             AS claimed_trial,
          COUNT(*) FILTER (WHERE mls_listing_id IS NOT NULL AND purged_at IS NULL)      AS total_mls_listings,
          COUNT(*) FILTER (WHERE mls_listing_id IS NOT NULL AND purged_at IS NULL
            AND created_at >= NOW() - INTERVAL '7 days')                                AS new_listings_7d,
          (SELECT COUNT(*) FROM ${agentsTable})::text                                   AS total_agents
        FROM ${listingsTable}
      `),

      // MLS sync health
      db.execute<{
        board_id: string; last_success_at: string | null;
        last_delta_sync_at: string | null; last_full_sync_at: string | null;
        last_error: string | null; last_error_at: string | null;
        total_listings: string;
      }>(sql`
        SELECT board_id, last_success_at, last_delta_sync_at, last_full_sync_at,
               last_error, last_error_at, total_listings
        FROM ${mlsSyncStateTable}
        LIMIT 1
      `),

      // Daily cold outreach sent — last 14 days for sparkline
      db.execute<{ day: string; count: string }>(sql`
        SELECT
          (sent_at AT TIME ZONE 'America/New_York')::date AS day,
          COUNT(*) AS count
        FROM ${emailOutboxTable}
        WHERE kind = 'cold_outreach'
          AND status = 'sent'
          AND sent_at >= NOW() - INTERVAL '14 days'
        GROUP BY 1
        ORDER BY 1 ASC
      `),
    ]);

    const outreachRow = (outreach as any).rows?.[0] ?? (outreach as any)[0] ?? {};
    const clickRow    = (clicks  as any).rows?.[0] ?? (clicks  as any)[0] ?? {};
    const revRow      = (revenue as any).rows?.[0] ?? (revenue as any)[0] ?? {};
    const mlsRow      = (mls     as any).rows?.[0] ?? (mls     as any)[0] ?? null;
    const dailyRows   = (dailySent as any).rows    ?? (dailySent as any) ?? [];

    const n = (v: string | undefined) => parseInt(v ?? "0", 10);

    // MLS health: healthy if last successful sync was within 30 minutes
    const lastSuccess = mlsRow?.last_success_at ? new Date(mlsRow.last_success_at) : null;
    const minutesSinceSync = lastSuccess ? (Date.now() - lastSuccess.getTime()) / 60_000 : null;
    const mlsHealthy = minutesSinceSync !== null && minutesSinceSync < 30;

    res.json({
      outreach: {
        sentToday:    n(outreachRow.sent_today),
        sent7d:       n(outreachRow.sent_7d),
        sent30d:      n(outreachRow.sent_30d),
        pendingQueue: n(outreachRow.pending),
        failed:       n(outreachRow.failed),
        cancelled:    n(outreachRow.cancelled),
        suppressed:   n(outreachRow.suppressed),
      },
      clicks: {
        clicksToday:       n(clickRow.clicks_today),
        clicks7d:          n(clickRow.clicks_7d),
        uniqueAgents7d:    n(clickRow.unique_agents_7d),
        activateClicks7d:  n(clickRow.activate_clicks_7d),
      },
      revenue: {
        paidActive:        n(revRow.paid_active),
        claimedTrial:      n(revRow.claimed_trial),
        totalMlsListings:  n(revRow.total_mls_listings),
        newListings7d:     n(revRow.new_listings_7d),
        totalAgents:       n(revRow.total_agents),
      },
      mlsSync: mlsRow ? {
        healthy:           mlsHealthy,
        minutesSinceSync:  minutesSinceSync !== null ? Math.round(minutesSinceSync) : null,
        lastSuccessAt:     mlsRow.last_success_at ?? null,
        lastDeltaSyncAt:   mlsRow.last_delta_sync_at ?? null,
        lastFullSyncAt:    mlsRow.last_full_sync_at ?? null,
        lastError:         mlsRow.last_error ?? null,
        lastErrorAt:       mlsRow.last_error_at ?? null,
        totalListings:     n(mlsRow.total_listings),
      } : null,
      dailySent: dailyRows.map((r: any) => ({ day: r.day, count: n(r.count) })),
    });
  } catch (err) {
    log.error({ err }, "Dashboard query failed");
    res.status(500).json({ error: "Failed to load dashboard data" });
  }
});

export default router;
