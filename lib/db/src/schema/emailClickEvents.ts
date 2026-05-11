import { pgTable, text, uuid, timestamp, index } from "drizzle-orm/pg-core";

/**
 * One row per tracked link created for an outbound email.
 * clickedAt is null until the first click — the redirect endpoint
 * stamps it on first visit so you can see exactly who opened what and when.
 */
export const emailClickEventsTable = pgTable(
  "email_click_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    /** Short UUID used in the tracking URL: /api/t/:token */
    token: text("token").notNull().unique(),
    /** The email_outbox row this link was created for — nullable (set async). */
    outboxId: uuid("outbox_id"),
    agentEmail: text("agent_email").notNull(),
    listingId: uuid("listing_id"),
    /**
     * Logical label for the link — e.g. "preview", "activate".
     * Free-form so new link types can be added without a migration.
     */
    linkType: text("link_type").notNull(),
    destinationUrl: text("destination_url").notNull(),
    /** Null until first click. */
    clickedAt: timestamp("clicked_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    tokenIdx: index("email_click_events_token_idx").on(table.token),
    agentEmailIdx: index("email_click_events_agent_email_idx").on(table.agentEmail),
    listingIdIdx: index("email_click_events_listing_id_idx").on(table.listingId),
    clickedAtIdx: index("email_click_events_clicked_at_idx").on(table.clickedAt),
  }),
);

export type EmailClickEvent = typeof emailClickEventsTable.$inferSelect;
