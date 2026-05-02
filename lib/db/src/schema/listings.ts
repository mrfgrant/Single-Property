import { pgTable, text, uuid, timestamp, integer, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { agentsTable } from "./agents";

export const listingsTable = pgTable("listings", {
  id: uuid("id").defaultRandom().primaryKey(),
  agentId: uuid("agent_id").references(() => agentsTable.id).notNull(),
  mlsListingId: text("mls_listing_id"),
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
  mode: text("mode").notNull().default("preview"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  domainName: text("domain_name"),
  closedReason: text("closed_reason"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

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
