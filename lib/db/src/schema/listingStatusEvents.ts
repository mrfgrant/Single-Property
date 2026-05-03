import { pgTable, text, uuid, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { listingsTable } from "./listings";

export const listingStatusEventsTable = pgTable(
  "listing_status_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    listingId: uuid("listing_id").references(() => listingsTable.id, { onDelete: "cascade" }).notNull(),
    fromStatus: text("from_status"),
    toStatus: text("to_status").notNull(),
    source: text("source").notNull().default("mls"),
    metadata: jsonb("metadata"),
    occurredAt: timestamp("occurred_at").defaultNow().notNull(),
  },
  (table) => ({
    listingIdx: index("listing_status_events_listing_idx").on(table.listingId),
  }),
);

export type ListingStatusEvent = typeof listingStatusEventsTable.$inferSelect;
