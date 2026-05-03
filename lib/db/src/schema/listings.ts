import { pgTable, text, uuid, timestamp, integer, real, index, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { agentsTable } from "./agents";

export const listingsTable = pgTable(
  "listings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    agentId: uuid("agent_id").references(() => agentsTable.id),
    mlsListingId: text("mls_listing_id"),
    listAgentMlsId: text("list_agent_mls_id"),
    listAgentName: text("list_agent_name"),
    listAgentEmail: text("list_agent_email"),
    listAgentPhone: text("list_agent_phone"),
    // MLS-sourced phone breakdown for cold-outreach SMS targeting.
    // We only text mobile/direct lines, never office. See lib/outreach/phone.ts.
    listAgentMobilePhone: text("list_agent_mobile_phone"),
    listAgentDirectPhone: text("list_agent_direct_phone"),
    listAgentOfficePhone: text("list_agent_office_phone"),
    // Seller's preferred email for analytics + the weekly seller report.
    // Collected post-activation via /listings/:id/seller-email.
    sellerEmail: text("seller_email"),
    address: text("address").notNull(),
    city: text("city").notNull(),
    state: text("state").notNull().default("GA"),
    zip: text("zip"),
    priceUsd: integer("price_usd"),
    beds: integer("beds"),
    baths: real("baths"),
    sqft: integer("sqft"),
    lotAcres: real("lot_acres"),
    yearBuilt: integer("year_built"),
    description: text("description"),
    photoUrls: text("photo_urls").array(),
    status: text("status").notNull().default("active"),
    mlsStatus: text("mls_status"),
    mode: text("mode").notNull().default("preview"),
    stripeSubscriptionId: text("stripe_subscription_id"),
    domainName: text("domain_name"),
    closedReason: text("closed_reason"),
    mlsModificationTimestamp: timestamp("mls_modification_timestamp"),
    // Set when the listing has been purged by the unclaimed-preview
    // cleanup job. Acts as a tombstone: the row is preserved (so the
    // MLS sync can recognize the mlsListingId and skip re-creating it),
    // but the photos/site/status-events are deleted and we never act on
    // it again.
    purgedAt: timestamp("purged_at"),
    purgedReason: text("purged_reason"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    listAgentMlsIdIdx: index("listings_list_agent_mls_id_idx").on(table.listAgentMlsId),
    // Partial unique index — enforces MLS identity at the DB level so
    // concurrent sync runs cannot insert duplicates, while still allowing
    // many manually-created listings with NULL mls_listing_id.
    mlsListingIdUq: uniqueIndex("listings_mls_listing_id_uq")
      .on(table.mlsListingId)
      .where(sql`${table.mlsListingId} IS NOT NULL`),
  }),
);

export const insertListingSchema = createInsertSchema(listingsTable).omit({
  id: true,
  mode: true,
  stripeSubscriptionId: true,
  domainName: true,
  closedReason: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertListing = z.infer<typeof insertListingSchema>;
export type Listing = typeof listingsTable.$inferSelect;

export type ListingMode = "preview" | "live" | "disabled";
export type ListingStatus = "active" | "closed" | "pending";
