import { pgTable, text, uuid, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { listingsTable } from "./listings";

export const sitesTable = pgTable(
  "sites",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    listingId: uuid("listing_id").references(() => listingsTable.id, { onDelete: "cascade" }).notNull(),
    mode: text("mode").notNull().default("preview"),
    redirectUrl: text("redirect_url"),
    lastDeployedAt: timestamp("last_deployed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    listingUq: uniqueIndex("sites_listing_uq").on(table.listingId),
  }),
);

export type Site = typeof sitesTable.$inferSelect;
export type SiteMode = "preview" | "live" | "disabled";
