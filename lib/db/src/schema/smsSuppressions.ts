import { pgTable, text, uuid, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const smsSuppressionsTable = pgTable("sms_suppressions", {
  id: uuid("id").defaultRandom().primaryKey(),
  phone: text("phone").notNull().unique(),
  source: text("source").notNull().default("stop_reply"),
  suppressedAt: timestamp("suppressed_at").defaultNow().notNull(),
});

export const insertSmsSuppressionSchema = createInsertSchema(smsSuppressionsTable).omit({
  id: true,
  suppressedAt: true,
});
export type InsertSmsSuppression = z.infer<typeof insertSmsSuppressionSchema>;
export type SmsSuppression = typeof smsSuppressionsTable.$inferSelect;
export type SmsSuppressionSource = "stop_reply" | "manual";
