import { pgTable, text, uuid, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { listingsTable } from "./listings";
import { agentsTable } from "./agents";

export const subscriptionsTable = pgTable(
  "subscriptions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    listingId: uuid("listing_id").references(() => listingsTable.id, { onDelete: "cascade" }).notNull(),
    agentId: uuid("agent_id").references(() => agentsTable.id),
    stripeSubscriptionId: text("stripe_subscription_id").notNull().unique(),
    stripeCustomerId: text("stripe_customer_id"),
    status: text("status").notNull().default("active"),
    currentPeriodStart: timestamp("current_period_start"),
    currentPeriodEnd: timestamp("current_period_end"),
    cancelAt: timestamp("cancel_at"),
    canceledAt: timestamp("canceled_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    listingUq: uniqueIndex("subscriptions_listing_uq").on(table.listingId),
    statusIdx: index("subscriptions_status_idx").on(table.status),
  }),
);

export type Subscription = typeof subscriptionsTable.$inferSelect;
export type SubscriptionStatus =
  | "active"
  | "past_due"
  | "unpaid"
  | "canceled"
  | "incomplete";
