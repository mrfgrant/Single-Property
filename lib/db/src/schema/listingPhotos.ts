import { pgTable, text, uuid, timestamp, integer, uniqueIndex, index } from "drizzle-orm/pg-core";
import { listingsTable } from "./listings";

export const listingPhotosTable = pgTable(
  "listing_photos",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    listingId: uuid("listing_id").references(() => listingsTable.id, { onDelete: "cascade" }).notNull(),
    mlsMediaKey: text("mls_media_key"),
    sourceUrl: text("source_url").notNull(),
    storedUrl: text("stored_url"),
    caption: text("caption"),
    order: integer("order").notNull().default(0),
    width: integer("width"),
    height: integer("height"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    listingIdIdx: index("listing_photos_listing_id_idx").on(table.listingId),
    mediaKeyUq: uniqueIndex("listing_photos_listing_media_uq").on(table.listingId, table.mlsMediaKey),
  }),
);

export type ListingPhoto = typeof listingPhotosTable.$inferSelect;
