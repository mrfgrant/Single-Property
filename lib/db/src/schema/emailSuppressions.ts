import { pgTable, text, uuid, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const emailSuppressionsTable = pgTable("email_suppressions", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  source: text("source").notNull().default("unsubscribe"),
  suppressedAt: timestamp("suppressed_at").defaultNow().notNull(),
});

export const insertEmailSuppressionSchema = createInsertSchema(emailSuppressionsTable).omit({
  id: true,
  suppressedAt: true,
});
export type InsertEmailSuppression = z.infer<typeof insertEmailSuppressionSchema>;
export type EmailSuppression = typeof emailSuppressionsTable.$inferSelect;
export type EmailSuppressionSource = "unsubscribe" | "bounce" | "spam" | "manual";
