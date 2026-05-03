import { db, analyticsEventsTable, leadsTable } from "@workspace/db";
import { sql, and, eq, gte, lt, count } from "drizzle-orm";

/**
 * Per-listing weekly stats used by the seller report. All math is done
 * in SQL so the report job stays cheap even at thousands of listings.
 */
export interface WeeklyStats {
  listingId: string;
  weekStart: Date;
  weekEnd: Date;
  visits: number;
  uniqueVisitors: number;
  avgTimeOnPageSec: number;
  pctMobile: number;
  topSource: string;
  sourceBreakdown: Record<string, number>;
  leads: number;
  cumulativeViews: number;
  // Comparison with previous week — used for the auto-narrative.
  prevWeekVisits: number;
  prevWeekLeads: number;
}

interface BasicAggregateRow {
  visits: number;
  uniques: number;
  mobile: number;
  total: number;
  avgSessionSec: number;
}

async function basicAggregate(
  listingId: string,
  fromUtc: Date,
  toUtc: Date,
): Promise<BasicAggregateRow> {
  // We compute everything in a single query for cheapness. Session
  // duration is approximated as the gap between session_start and the
  // last event in the same session (capped at 30 min so an idle tab
  // doesn't inflate avg time on page).
  const [agg] = await db.execute<{
    visits: string;
    uniques: string;
    mobile: string;
    total: string;
    avg_session_sec: string;
  }>(sql`
    WITH events AS (
      SELECT *
        FROM ${analyticsEventsTable}
       WHERE ${analyticsEventsTable.listingId} = ${listingId}
         AND ${analyticsEventsTable.occurredAt} >= ${fromUtc}
         AND ${analyticsEventsTable.occurredAt} <  ${toUtc}
    ),
    sessions AS (
      SELECT session_id,
             MAX(device) FILTER (WHERE device IS NOT NULL) AS device,
             EXTRACT(EPOCH FROM (MAX(occurred_at) - MIN(occurred_at))) AS seconds
        FROM events
       GROUP BY session_id
    )
    SELECT
      (SELECT COUNT(*) FROM events WHERE event_type = 'pageview')::text AS visits,
      (SELECT COUNT(DISTINCT ip_hash) FROM events WHERE ip_hash IS NOT NULL)::text AS uniques,
      (SELECT COUNT(*) FROM sessions WHERE device = 'mobile')::text AS mobile,
      (SELECT COUNT(*) FROM sessions)::text AS total,
      COALESCE((
        SELECT AVG(LEAST(seconds, 1800))
          FROM sessions
         WHERE seconds > 0
      ), 0)::text AS avg_session_sec
  `).then((r) => {
    const rows =
      (r as unknown as { rows: Array<Record<string, string>> }).rows ??
      (r as unknown as Array<Record<string, string>>);
    return rows;
  });

  return {
    visits: Number(agg?.visits ?? 0),
    uniques: Number(agg?.uniques ?? 0),
    mobile: Number(agg?.mobile ?? 0),
    total: Number(agg?.total ?? 0),
    avgSessionSec: Math.round(Number(agg?.avg_session_sec ?? 0)),
  };
}

async function sourceBreakdown(
  listingId: string,
  fromUtc: Date,
  toUtc: Date,
): Promise<Record<string, number>> {
  const rows = await db
    .select({
      source: analyticsEventsTable.source,
      n: count(),
    })
    .from(analyticsEventsTable)
    .where(
      and(
        eq(analyticsEventsTable.listingId, listingId),
        eq(analyticsEventsTable.eventType, "pageview"),
        gte(analyticsEventsTable.occurredAt, fromUtc),
        lt(analyticsEventsTable.occurredAt, toUtc),
      ),
    )
    .groupBy(analyticsEventsTable.source);
  const out: Record<string, number> = {};
  for (const r of rows) {
    out[r.source ?? "direct"] = Number(r.n);
  }
  return out;
}

async function leadCount(
  listingId: string,
  fromUtc: Date,
  toUtc: Date,
): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(leadsTable)
    .where(
      and(
        eq(leadsTable.listingId, listingId),
        gte(leadsTable.createdAt, fromUtc),
        lt(leadsTable.createdAt, toUtc),
      ),
    );
  return Number(row?.n ?? 0);
}

async function cumulativeViews(listingId: string, untilUtc: Date): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(analyticsEventsTable)
    .where(
      and(
        eq(analyticsEventsTable.listingId, listingId),
        eq(analyticsEventsTable.eventType, "pageview"),
        lt(analyticsEventsTable.occurredAt, untilUtc),
      ),
    );
  return Number(row?.n ?? 0);
}

/**
 * Build the full weekly stats blob for a listing. `weekStart` is the
 * UTC instant corresponding to local Monday 00:00 in the listing's TZ.
 * The window is [weekStart, weekStart + 7d).
 */
export async function getWeeklyStats(
  listingId: string,
  weekStart: Date,
): Promise<WeeklyStats> {
  const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);
  const prevWeekStart = new Date(weekStart.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [basic, sources, leads, cumulative, prevBasic, prevLeads] = await Promise.all([
    basicAggregate(listingId, weekStart, weekEnd),
    sourceBreakdown(listingId, weekStart, weekEnd),
    leadCount(listingId, weekStart, weekEnd),
    cumulativeViews(listingId, weekEnd),
    basicAggregate(listingId, prevWeekStart, weekStart),
    leadCount(listingId, prevWeekStart, weekStart),
  ]);

  const topSource =
    Object.entries(sources).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "direct";
  const pctMobile = basic.total > 0 ? Math.round((basic.mobile / basic.total) * 100) : 0;

  return {
    listingId,
    weekStart,
    weekEnd,
    visits: basic.visits,
    uniqueVisitors: basic.uniques,
    avgTimeOnPageSec: basic.avgSessionSec,
    pctMobile,
    topSource,
    sourceBreakdown: sources,
    leads,
    cumulativeViews: cumulative,
    prevWeekVisits: prevBasic.visits,
    prevWeekLeads: prevLeads,
  };
}

/**
 * 2–3 sentence auto-narrative summarizing the week. Deterministic — we
 * deliberately avoid an LLM here so the report job has zero external
 * dependencies and stays fast/cheap at thousands of listings.
 */
export function buildNarrative(stats: WeeklyStats): string {
  const parts: string[] = [];
  if (stats.visits === 0) {
    return "No new visits this week. Share your site link on social media or with neighbors to drive traffic.";
  }
  const delta =
    stats.prevWeekVisits > 0
      ? Math.round(((stats.visits - stats.prevWeekVisits) / stats.prevWeekVisits) * 100)
      : null;
  if (delta === null) {
    parts.push(`${stats.visits} ${stats.visits === 1 ? "visit" : "visits"} this week — your first full week of traffic data.`);
  } else if (delta > 0) {
    parts.push(`Traffic is up ${delta}% from last week (${stats.visits} visits).`);
  } else if (delta < 0) {
    parts.push(`Traffic is down ${Math.abs(delta)}% from last week (${stats.visits} visits).`);
  } else {
    parts.push(`Traffic held steady at ${stats.visits} visits this week.`);
  }
  if (stats.leads > 0) {
    parts.push(`${stats.leads} new ${stats.leads === 1 ? "inquiry was" : "inquiries were"} received.`);
  } else if (stats.prevWeekLeads > 0) {
    parts.push(`No new inquiries this week (${stats.prevWeekLeads} last week).`);
  }
  if (stats.pctMobile >= 60) {
    parts.push(`${stats.pctMobile}% of visitors browsed on mobile.`);
  }
  return parts.join(" ");
}

/**
 * Final marketing summary (close-of-listing) — total views, total
 * leads, days on market, list/sold dates.
 */
export interface FinalMarketingStats {
  listingId: string;
  totalViews: number;
  totalLeads: number;
  daysOnMarket: number;
  dateListed: Date;
  dateClosed: Date;
}

export async function getFinalMarketingStats(
  listingId: string,
  dateListed: Date,
  dateClosed: Date,
): Promise<FinalMarketingStats> {
  const [views, leads] = await Promise.all([
    cumulativeViews(listingId, dateClosed),
    leadCount(listingId, dateListed, dateClosed),
  ]);
  const daysOnMarket = Math.max(
    1,
    Math.round((dateClosed.getTime() - dateListed.getTime()) / (24 * 60 * 60 * 1000)),
  );
  return {
    listingId,
    totalViews: views,
    totalLeads: leads,
    daysOnMarket,
    dateListed,
    dateClosed,
  };
}
