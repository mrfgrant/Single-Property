import { pgTable, text, uuid, timestamp, integer, real, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const exampleListingsTable = pgTable("example_listings", {
  id: uuid("id").defaultRandom().primaryKey(),
  mlsId: text("mls_id"),
  slug: text("slug").notNull().unique(),
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
  garage: boolean("garage").default(false),
  description: text("description"),
  agentName: text("agent_name"),
  agentPhone: text("agent_phone"),
  agentEmail: text("agent_email"),
  agentPhotoUrl: text("agent_photo_url"),
  agentBrokerage: text("agent_brokerage"),
  photoUrls: text("photo_urls").array(),
  walkScore: integer("walk_score"),
  bikeScore: integer("bike_score"),
  schoolRating: integer("school_rating"),
  transitScore: integer("transit_score"),
  domainName: text("domain_name"),
  status: text("status").notNull().default("active"),
  featured: boolean("featured").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertExampleListingSchema = createInsertSchema(exampleListingsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertExampleListing = z.infer<typeof insertExampleListingSchema>;
export type ExampleListing = typeof exampleListingsTable.$inferSelect;
