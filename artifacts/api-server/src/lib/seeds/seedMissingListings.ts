import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { sql } from "drizzle-orm";
import { db, listingsTable } from "@workspace/db";
import { inArray, isNull, eq } from "drizzle-orm";
import { logger } from "../logger.js";

const log = logger.child({ component: "seed-missing-listings" });

interface ListingSeedRow {
  id: string;
  mls_listing_id: string | null;
  list_agent_mls_id: string | null;
  list_agent_name: string | null;
  list_agent_email: string | null;
  list_agent_phone: string | null;
  address: string;
  city: string;
  state: string;
  zip: string | null;
  price_usd: number | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  lot_acres: string | null;
  year_built: number | null;
  status: string;
  mls_status: string | null;
  mls_modification_timestamp: string | null;
  mls_list_date: string | null;
  mls_human_id: string | null;
  mls_brokerage_name: string | null;
  mode: string;
  created_at: string;
  updated_at: string;
  photo_urls: string[] | null;
  description: string | null;
}

const safeDate = (s: string | null | undefined): Date | undefined => {
  if (!s) return undefined;
  const d = new Date(s);
  return isNaN(d.getTime()) ? undefined : d;
};

const safeInt = (v: number | string | null | undefined): number | undefined => {
  if (v == null) return undefined;
  const n = typeof v === "number" ? v : Number(v);
  return isNaN(n) ? undefined : Math.round(n);
};

const safeFloat = (v: number | string | null | undefined): number | undefined => {
  if (v == null) return undefined;
  const n = typeof v === "number" ? v : Number(v);
  return isNaN(n) ? undefined : n;
};

/**
 * Seeds MLS listings that were ingested by the dev environment but are absent
 * from production. These are listings the cold-outreach emails link to — without
 * them the tracked links 404.
 *
 * Preserves the dev-generated UUID as the primary key so existing click-event
 * tokens (which already reference those UUIDs) resolve correctly.
 *
 * Skips any listing whose mls_listing_id is already present locally (under any
 * UUID) to avoid violating the unique constraint, but still backfills photo_urls
 * for listings that were inserted on a previous boot without photos.
 *
 * Runs idempotently — safe to call on every boot.
 */
export async function seedMissingListings(): Promise<void> {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const seedPath = join(__dirname, "missingListingsSeed.json");

  let rows: ListingSeedRow[];
  try {
    const raw = readFileSync(seedPath, "utf8");
    rows = JSON.parse(raw) as ListingSeedRow[];
  } catch {
    log.warn("No missing listings seed file found — skipping");
    return;
  }

  if (!rows.length) return;

  // Find which mls_listing_ids already exist locally (under any UUID).
  // These must be skipped for INSERT to avoid the unique constraint on mls_listing_id.
  const rowsWithMlsId = rows.filter((r) => r.mls_listing_id);
  const allMlsIds = rowsWithMlsId.map((r) => r.mls_listing_id!);
  const allIds = rows.map((r) => r.id);

  const LOOKUP_BATCH = 200;
  const existingMlsIds = new Set<string>();
  for (let i = 0; i < allMlsIds.length; i += LOOKUP_BATCH) {
    const batch = allMlsIds.slice(i, i + LOOKUP_BATCH);
    const existing = await db
      .select({ mlsListingId: listingsTable.mlsListingId })
      .from(listingsTable)
      .where(inArray(listingsTable.mlsListingId, batch));
    for (const row of existing) {
      if (row.mlsListingId) existingMlsIds.add(row.mlsListingId);
    }
  }

  const toInsert = rows.filter(
    (r) => !r.mls_listing_id || !existingMlsIds.has(r.mls_listing_id),
  );

  const now = new Date();

  if (toInsert.length > 0) {
    log.info(
      { total: rows.length, toInsert: toInsert.length, skipped: rows.length - toInsert.length },
      "Seeding missing MLS listings into DB",
    );

    const BATCH = 50;
    let inserted = 0;

    for (let i = 0; i < toInsert.length; i += BATCH) {
      const batch = toInsert.slice(i, i + BATCH);
      const values = batch.map((r) => ({
        id: r.id,
        mlsListingId: r.mls_listing_id ?? undefined,
        listAgentMlsId: r.list_agent_mls_id ?? undefined,
        listAgentName: r.list_agent_name ?? undefined,
        listAgentEmail: r.list_agent_email ?? undefined,
        listAgentPhone: r.list_agent_phone ?? undefined,
        address: r.address ?? "Unknown",
        city: r.city ?? "Unknown",
        state: r.state ?? "GA",
        zip: r.zip ?? undefined,
        priceUsd: safeInt(r.price_usd),
        beds: safeInt(r.beds),
        baths: safeInt(r.baths),
        sqft: safeInt(r.sqft),
        lotAcres: safeFloat(r.lot_acres),
        yearBuilt: safeInt(r.year_built),
        description: r.description ?? undefined,
        status: (r.status as "active" | "pending" | "closed" | "archived") ?? "active",
        mlsStatus: r.mls_status ?? undefined,
        mlsModificationTimestamp: safeDate(r.mls_modification_timestamp),
        mlsListDate: r.mls_list_date ?? undefined,
        mlsHumanId: r.mls_human_id ?? undefined,
        mlsBrokerageName: r.mls_brokerage_name ?? undefined,
        mode: (r.mode as "preview" | "active" | "disabled") ?? "preview",
        photoUrls: r.photo_urls?.length ? r.photo_urls : undefined,
        mlsLastSyncedAt: now,
        createdAt: safeDate(r.created_at) ?? now,
        updatedAt: safeDate(r.updated_at) ?? now,
      }));

      await db.insert(listingsTable).values(values).onConflictDoNothing();
      inserted += batch.length;
    }

    log.info({ inserted }, "Missing listings seed complete");
  } else {
    log.info("All seed listings already present — checking photo backfill");
  }

  // Backfill photo_urls for listings inserted on a previous boot without photos.
  // Only update rows that (a) we seeded (id in our list) and (b) have no photos yet.
  const rowsWithPhotos = rows.filter((r) => r.photo_urls?.length);
  if (!rowsWithPhotos.length) return;

  // Build VALUES clause for a single batched UPDATE
  const PHOTO_BATCH = 100;
  let photoUpdated = 0;

  for (let i = 0; i < rowsWithPhotos.length; i += PHOTO_BATCH) {
    const batch = rowsWithPhotos.slice(i, i + PHOTO_BATCH);

    // Check which of these ids actually exist locally with no photos
    const ids = batch.map((r) => r.id);
    const existing = await db
      .select({ id: listingsTable.id, photoUrls: listingsTable.photoUrls })
      .from(listingsTable)
      .where(inArray(listingsTable.id, ids));

    const needsPhoto = existing.filter(
      (e) => !e.photoUrls || (e.photoUrls as string[]).length === 0,
    );
    if (!needsPhoto.length) continue;

    const needsPhotoIds = new Set(needsPhoto.map((e) => e.id));
    const toUpdate = batch.filter((r) => needsPhotoIds.has(r.id));

    for (const r of toUpdate) {
      await db
        .update(listingsTable)
        .set({ photoUrls: r.photo_urls!, updatedAt: now })
        .where(eq(listingsTable.id, r.id));
      photoUpdated++;
    }
  }

  if (photoUpdated > 0) {
    log.info({ photoUpdated }, "Backfilled photo_urls for seeded listings");
  } else {
    log.info("No photo backfill needed");
  }
}
