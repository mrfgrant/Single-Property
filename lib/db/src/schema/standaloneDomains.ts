import { pgTable, text, uuid, timestamp } from "drizzle-orm/pg-core";

export const standaloneDomainsTable = pgTable("standalone_domains", {
  id: uuid("id").defaultRandom().primaryKey(),
  domain: text("domain").notNull().unique(),
  cloudflareZoneId: text("cloudflare_zone_id"),
  notes: text("notes"),
  registeredAt: timestamp("registered_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type StandaloneDomain = typeof standaloneDomainsTable.$inferSelect;
