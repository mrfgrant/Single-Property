import { pgTable, text, uuid, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const automationRunsTable = pgTable("automation_runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  listingId: text("listing_id"),
  domainName: text("domain_name"),
  cloudflareZoneId: text("cloudflare_zone_id"),
  cloudflareDnsRecordId: text("cloudflare_dns_record_id"),
  step: text("step").notNull().default("pending"),
  status: text("status").notNull().default("pending"),
  redirectUrl: text("redirect_url"),
  errorMessage: text("error_message"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertAutomationRunSchema = createInsertSchema(automationRunsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertAutomationRun = z.infer<typeof insertAutomationRunSchema>;
export type AutomationRun = typeof automationRunsTable.$inferSelect;

export type RunStatus = "pending" | "running" | "completed" | "failed";
export type RunStep =
  | "pending"
  | "domain_generated"
  | "domain_registered"
  | "zone_ready"
  | "dns_record_created"
  | "replit_handoff_pending"
  | "completed";
