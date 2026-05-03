import { pgTable, text, uuid, timestamp, integer, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Outbox table for outbound email. The dispatcher worker drains rows
 * with `status='pending'` and `sendAfter <= now()`, calls the provider,
 * records `providerMessageId` + status, and retries failed rows with
 * exponential backoff (capped at maxAttempts).
 */
export const emailOutboxTable = pgTable(
  "email_outbox",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    toEmail: text("to_email").notNull(),
    /** Optional secondary recipient — agent CC on seller-facing reports, etc. */
    ccEmail: text("cc_email"),
    subject: text("subject").notNull(),
    html: text("html").notNull(),
    textBody: text("text_body"),
    /**
     * Logical category for the message. Examples:
     *   - "transactional" (site-live, payment-failed) — never suppressed.
     *   - "lead_alert" (buyer lead → agent) — never suppressed.
     *   - "buyer_auto_reply" (auto-reply to a buyer) — never suppressed.
     *   - "cold_outreach" — gated on email suppression list.
     */
    kind: text("kind").notNull(),
    /** ID for de-duping logical events (e.g. listingId+stage). Optional. */
    dedupeKey: text("dedupe_key"),
    status: text("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(5),
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
    statusSendAfterIdx: index("email_outbox_status_send_after_idx").on(
      table.status,
      table.sendAfter,
    ),
    dedupeIdx: index("email_outbox_dedupe_key_idx").on(table.dedupeKey),
  }),
);

export const insertEmailOutboxSchema = createInsertSchema(emailOutboxTable).omit({
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
export type InsertEmailOutbox = z.infer<typeof insertEmailOutboxSchema>;
export type EmailOutbox = typeof emailOutboxTable.$inferSelect;
export type EmailOutboxStatus = "pending" | "sent" | "failed" | "suppressed" | "cancelled";
