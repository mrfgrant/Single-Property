import { pgTable, text, uuid, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const agentsTable = pgTable("agents", {
  id: uuid("id").defaultRandom().primaryKey(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email").notNull().unique(),
  phone: text("phone"),
  mlsAgentId: text("mls_agent_id").notNull().unique(),
  headshotUrl: text("headshot_url"),
  brokerage: text("brokerage"),
  logoUrl: text("logo_url"),
  personalWebsiteUrl: text("personal_website_url"),
  stripeCustomerId: text("stripe_customer_id"),
  magicLinkToken: text("magic_link_token"),
  magicLinkExpiresAt: timestamp("magic_link_expires_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertAgentSchema = createInsertSchema(agentsTable).omit({
  id: true,
  stripeCustomerId: true,
  magicLinkToken: true,
  magicLinkExpiresAt: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertAgent = z.infer<typeof insertAgentSchema>;
export type Agent = typeof agentsTable.$inferSelect;
