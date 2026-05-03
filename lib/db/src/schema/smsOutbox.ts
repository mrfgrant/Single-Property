import { pgTable, text, uuid, timestamp, integer, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Outbox table for outbound Telnyx SMS. The dispatcher drains
 * `status='pending'` rows due now, runs Telnyx Number Lookup if not
 * already cached on the agent, gates on `sms_suppressions`, sends via
 * Telnyx, and records `providerMessageId` + status.
 */
export const smsOutboxTable = pgTable(
  "sms_outbox",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    toPhone: text("to_phone").notNull(), // E.164
    body: text("body").notNull(),
    /**
     *   - "cold_outreach" — gated on sms_suppressions.
     *   - "transactional" — reserved (currently unused; email-only for MVP).
     */
    kind: text("kind").notNull().default("cold_outreach"),
    dedupeKey: text("dedupe_key"),
    status: text("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(3),
    sendAfter: timestamp("send_after").defaultNow().notNull(),
    sentAt: timestamp("sent_at"),
    failedAt: timestamp("failed_at"),
    lastError: text("last_error"),
    providerMessageId: text("provider_message_id"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    statusSendAfterIdx: index("sms_outbox_status_send_after_idx").on(
      table.status,
      table.sendAfter,
    ),
    dedupeIdx: index("sms_outbox_dedupe_key_idx").on(table.dedupeKey),
  }),
);

export const insertSmsOutboxSchema = createInsertSchema(smsOutboxTable).omit({
  id: true,
  status: true,
  attempts: true,
  sentAt: true,
  failedAt: true,
  lastError: true,
  providerMessageId: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertSmsOutbox = z.infer<typeof insertSmsOutboxSchema>;
export type SmsOutbox = typeof smsOutboxTable.$inferSelect;
export type SmsOutboxStatus = "pending" | "sent" | "failed" | "suppressed" | "cancelled";
