import { pgTable, text, uuid, timestamp, integer, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { listingsTable } from "./listings";

/**
 * Custom event store for property-site traffic. We deliberately keep
 * this in our own Postgres (no third-party analytics) per the product
 * brief. Rows are append-only, single-table, and feed both the weekly
 * seller report and the close-of-listing marketing summary.
 *
 * Privacy notes:
 *   - We never persist raw IP addresses; only an HMAC-hashed,
 *     daily-rotating token (see lib/analytics/ipHash.ts) used for
 *     unique-visitor counting within a 7-day window.
 *   - Geo is city/region only — no precise lat/lon, no GPS.
 *   - sessionId is a client-generated UUID stored in sessionStorage; it
 *     does not correlate across browser sessions or devices.
 */
export const analyticsEventsTable = pgTable(
  "analytics_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    listingId: uuid("listing_id")
      .references(() => listingsTable.id, { onDelete: "cascade" })
      .notNull(),
    sessionId: text("session_id").notNull(),
    /**
     * One of: pageview, session_start, session_end, gallery_photo_view,
     * lead_submitted. Stored as text (not enum) so we can add event
     * types without a migration.
     */
    eventType: text("event_type").notNull(),
    occurredAt: timestamp("occurred_at").defaultNow().notNull(),
    /** Classified traffic source: direct/google/facebook/instagram/qr/other. */
    source: text("source"),
    /** mobile | desktop (tablet rolls into mobile by viewport heuristic). */
    device: text("device"),
    /** City-level geo derived server-side from IP (e.g. Cloudflare cf-ipcity). */
    city: text("city"),
    region: text("region"),
    referrer: text("referrer"),
    /** For gallery_photo_view only — which photo index was opened. */
    photoIndex: integer("photo_index"),
    /** Daily-rotating HMAC of IP + UA for unique-visitor counting. */
    ipHash: text("ip_hash"),
    userAgent: text("user_agent"),
    /** Page path (e.g. "/", "/gallery"). Useful for future per-section breakdowns. */
    path: text("path"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    listingOccurredIdx: index("analytics_events_listing_occurred_idx").on(
      table.listingId,
      table.occurredAt,
    ),
    listingTypeIdx: index("analytics_events_listing_type_idx").on(
      table.listingId,
      table.eventType,
    ),
    sessionIdx: index("analytics_events_session_idx").on(table.sessionId),
    occurredAtIdx: index("analytics_events_occurred_at_idx").on(table.occurredAt),
  }),
);

export const insertAnalyticsEventSchema = createInsertSchema(analyticsEventsTable).omit({
  id: true,
  occurredAt: true,
  createdAt: true,
});
export type InsertAnalyticsEvent = z.infer<typeof insertAnalyticsEventSchema>;
export type AnalyticsEvent = typeof analyticsEventsTable.$inferSelect;

export const ANALYTICS_EVENT_TYPES = [
  "pageview",
  "session_start",
  "session_end",
  "gallery_photo_view",
  "lead_submitted",
] as const;
export type AnalyticsEventType = (typeof ANALYTICS_EVENT_TYPES)[number];

/**
 * Tracks the most recently sent weekly seller report per listing so the
 * cron loop is idempotent — re-running the Monday tick (or backfilling
 * a week) won't double-send. The unique constraint pairs (listing_id,
 * week_start) so manual re-sends for a different week are still allowed.
 */
export const sellerReportsSentTable = pgTable(
  "seller_reports_sent",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    listingId: uuid("listing_id")
      .references(() => listingsTable.id, { onDelete: "cascade" })
      .notNull(),
    /** Monday 00:00 in the listing's local timezone, stored as UTC instant. */
    weekStart: timestamp("week_start").notNull(),
    sentAt: timestamp("sent_at").defaultNow().notNull(),
  },
  (table) => ({
    uniqueWeek: uniqueIndex("seller_reports_listing_week_uq").on(
      table.listingId,
      table.weekStart,
    ),
  }),
);

export type SellerReportSent = typeof sellerReportsSentTable.$inferSelect;
