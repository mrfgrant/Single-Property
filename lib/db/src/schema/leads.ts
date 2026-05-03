import { pgTable, text, uuid, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { listingsTable } from "./listings";

export const leadsTable = pgTable(
  "leads",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    listingId: uuid("listing_id")
      .references(() => listingsTable.id)
      .notNull(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    phone: text("phone"),
    message: text("message"),
    source: text("source").notNull().default("listing_site"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    listingIdx: index("leads_listing_id_idx").on(table.listingId),
    createdAtIdx: index("leads_created_at_idx").on(table.createdAt),
  }),
);

export const insertLeadSchema = createInsertSchema(leadsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertLead = z.infer<typeof insertLeadSchema>;
export type Lead = typeof leadsTable.$inferSelect;
