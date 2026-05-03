import { pgTable, text, timestamp, integer, uuid } from "drizzle-orm/pg-core";

/**
 * Single-row table tracking the state of MLS ingestion.
 * boardId is the primary key so that adding a second board in Phase 2
 * is a row-insert rather than a schema migration.
 */
export const mlsSyncStateTable = pgTable("mls_sync_state", {
  boardId: text("board_id").primaryKey(),
  lastFullSyncAt: timestamp("last_full_sync_at"),
  lastDeltaWatermark: timestamp("last_delta_watermark"),
  lastDeltaSyncAt: timestamp("last_delta_sync_at"),
  lastSuccessAt: timestamp("last_success_at"),
  lastError: text("last_error"),
  lastErrorAt: timestamp("last_error_at"),
  totalListings: integer("total_listings").notNull().default(0),
  runId: uuid("run_id"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type MlsSyncState = typeof mlsSyncStateTable.$inferSelect;
