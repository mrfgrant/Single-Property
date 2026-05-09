import { db } from "@workspace/db";
import {
  listingsTable,
  listingPhotosTable,
  listingStatusEventsTable,
  mlsSyncStateTable,
  type Listing,
} from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { logger } from "../logger.js";
import { mlsClient, MlsNotConfiguredError, type ResoProperty } from "./client.js";
import { mlsEventBus } from "./eventBus.js";
import { getMlsConfig, normalizeStatus } from "./config.js";
import { downloadAndStorePhoto } from "./photoUtils.js";

function buildAddress(p: ResoProperty): string {
  if (p.UnparsedAddress?.trim()) return p.UnparsedAddress.trim();
  return [p.StreetNumber, p.StreetName, p.StreetSuffix].filter(Boolean).join(" ").trim() || "Unknown";
}

function mapResoToListing(p: ResoProperty): Partial<Listing> & { mlsListingId: string } {
  const status = normalizeStatus(p.StandardStatus ?? p.MlsStatus);
  return {
    mlsListingId: p.ListingKey,
    listAgentMlsId: p.ListAgentMlsId ?? null,
    listAgentName: p.ListAgentFullName ?? null,
    listAgentEmail: p.ListAgentEmail ?? null,
    listAgentPhone: p.ListAgentPreferredPhone ?? null,
    address: buildAddress(p),
    city: p.City ?? "Unknown",
    state: p.StateOrProvince ?? "GA",
    zip: p.PostalCode ?? null,
    priceUsd: p.ListPrice ?? null,
    beds: p.BedroomsTotal ?? null,
    baths: p.BathroomsTotalDecimal ?? p.BathroomsTotalInteger ?? null,
    // SourceRE populates BuildingAreaTotal; LivingArea is almost always null.
    // Round to integer — the DB column is integer and SourceRE can return floats.
    sqft: Math.round(p.BuildingAreaTotal ?? p.LivingArea ?? p.AboveGradeFinishedArea ?? 0) || null,
    lotAcres: p.LotSizeAcres ?? null,
    yearBuilt: p.YearBuilt ?? null,
    description: p.PublicRemarks ?? null,
    status,
    mlsStatus: p.StandardStatus ?? p.MlsStatus ?? null,
    mlsModificationTimestamp: p.ModificationTimestamp ? new Date(p.ModificationTimestamp) : null,
    mlsHumanId: p.ListingId ?? null,
    mlsBrokerageName: p.ListOfficeName ?? null,
    mlsLastSyncedAt: new Date(),
    updatedAt: new Date(),
  };
}

const TRACKED_FIELDS: (keyof Listing)[] = [
  "address", "city", "state", "zip",
  "priceUsd", "beds", "baths", "sqft", "lotAcres", "yearBuilt",
  "description",
  "listAgentMlsId", "listAgentName", "listAgentEmail", "listAgentPhone",
  "mlsStatus", "status",
  "mlsModificationTimestamp",
  // Brokerage attribution: required by IDX rules, so a change should
  // be treated as a content change and propagate (event emit, etc.).
  "mlsBrokerageName",
];

function valuesEqual(a: unknown, b: unknown): boolean {
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  if (a instanceof Date || b instanceof Date) {
    const at = a instanceof Date ? a.getTime() : a == null ? null : new Date(a as string).getTime();
    const bt = b instanceof Date ? b.getTime() : b == null ? null : new Date(b as string).getTime();
    return at === bt;
  }
  return a === b;
}

function diffFields(prev: Listing, next: Partial<Listing>): string[] {
  const changed: string[] = [];
  for (const f of TRACKED_FIELDS) {
    if (next[f] !== undefined && !valuesEqual(next[f], prev[f])) changed.push(String(f));
  }
  return changed;
}

/**
 * Upsert a single MLS property and return its listingId if the row was
 * touched (inserted or updated), otherwise null. Returning the id lets
 * the caller drive selective photo sync without re-querying.
 */
async function upsertProperty(p: ResoProperty): Promise<string | null> {
  const mapped = mapResoToListing(p);
  const [existing] = await db
    .select()
    .from(listingsTable)
    .where(eq(listingsTable.mlsListingId, mapped.mlsListingId));

  // Tombstoned listing: previously purged by the unclaimed-preview
  // cleanup. Do NOT resurrect it on subsequent syncs even though it's
  // still active in the MLS. The agent had their chance; we won't keep
  // re-creating it forever.
  if (existing?.purgedAt) {
    return null;
  }

  if (!existing) {
    const [inserted] = await db
      .insert(listingsTable)
      .values({
        mlsListingId: mapped.mlsListingId,
        listAgentMlsId: mapped.listAgentMlsId ?? undefined,
        listAgentName: mapped.listAgentName ?? undefined,
        listAgentEmail: mapped.listAgentEmail ?? undefined,
        listAgentPhone: mapped.listAgentPhone ?? undefined,
        address: mapped.address ?? "Unknown",
        city: mapped.city ?? "Unknown",
        state: mapped.state ?? "GA",
        zip: mapped.zip ?? undefined,
        priceUsd: mapped.priceUsd ?? undefined,
        beds: mapped.beds ?? undefined,
        baths: mapped.baths ?? undefined,
        sqft: mapped.sqft ?? undefined,
        lotAcres: mapped.lotAcres ?? undefined,
        yearBuilt: mapped.yearBuilt ?? undefined,
        description: mapped.description ?? undefined,
        status: mapped.status ?? "active",
        mlsStatus: mapped.mlsStatus ?? undefined,
        mlsModificationTimestamp: mapped.mlsModificationTimestamp ?? undefined,
        mlsHumanId: mapped.mlsHumanId ?? undefined,
        mlsBrokerageName: mapped.mlsBrokerageName ?? undefined,
        mlsLastSyncedAt: mapped.mlsLastSyncedAt ?? undefined,
      })
      .returning();

    await db.insert(listingStatusEventsTable).values({
      listingId: inserted.id,
      fromStatus: null,
      toStatus: inserted.status,
      source: "mls",
      metadata: { reason: "initial_ingest", mlsStatus: mapped.mlsStatus },
    });

    mlsEventBus.emit("listing.upserted", {
      listingId: inserted.id,
      mlsListingId: inserted.mlsListingId,
      isNew: true,
      changedFields: TRACKED_FIELDS.map(String),
    });

    if (inserted.status !== "pending") {
      mlsEventBus.emit("listing.status_changed", {
        listingId: inserted.id,
        mlsListingId: inserted.mlsListingId,
        fromStatus: null,
        toStatus: inserted.status,
        mlsStatus: inserted.mlsStatus ?? null,
        source: "mls",
        occurredAt: new Date(),
      });
    }
    return inserted.id;
  }

  const changed = diffFields(existing, mapped);
  if (changed.length === 0) {
    // No tracked content changes — but we still need to refresh
    // `mlsLastSyncedAt` so the IDX "Last updated …" footer reflects
    // the most recent successful refresh (and to backfill the field
    // for rows that were ingested before the column existed). Skip
    // event emission since nothing the rest of the system cares about
    // actually changed.
    await db
      .update(listingsTable)
      .set({
        mlsLastSyncedAt: mapped.mlsLastSyncedAt ?? new Date(),
        mlsBrokerageName: mapped.mlsBrokerageName ?? existing.mlsBrokerageName,
        mlsHumanId: mapped.mlsHumanId ?? existing.mlsHumanId,
      })
      .where(eq(listingsTable.id, existing.id));
    return null;
  }

  const [updated] = await db
    .update(listingsTable)
    .set(mapped)
    .where(eq(listingsTable.id, existing.id))
    .returning();

  if (changed.includes("status") && existing.status !== updated.status) {
    await db.insert(listingStatusEventsTable).values({
      listingId: updated.id,
      fromStatus: existing.status,
      toStatus: updated.status,
      source: "mls",
      metadata: { mlsStatus: updated.mlsStatus },
    });
    mlsEventBus.emit("listing.status_changed", {
      listingId: updated.id,
      mlsListingId: updated.mlsListingId,
      fromStatus: existing.status,
      toStatus: updated.status,
      mlsStatus: updated.mlsStatus ?? null,
      source: "mls",
      occurredAt: new Date(),
    });
  }

  mlsEventBus.emit("listing.upserted", {
    listingId: updated.id,
    mlsListingId: updated.mlsListingId,
    isNew: false,
    changedFields: changed,
  });
  return updated.id;
}

async function syncPhotos(listingId: string, listingKey: string): Promise<void> {
  try {
    const media = await mlsClient.fetchMediaForListing(listingKey);
    if (media.length === 0) return;

    // Look up which mediaKeys we already have a stored copy for, so we
    // don't re-download photos that haven't changed.
    const existing = await db
      .select({
        mlsMediaKey: listingPhotosTable.mlsMediaKey,
        storedUrl: listingPhotosTable.storedUrl,
      })
      .from(listingPhotosTable)
      .where(eq(listingPhotosTable.listingId, listingId));
    const storedByKey = new Map<string, string | null>();
    for (const row of existing) {
      if (row.mlsMediaKey) storedByKey.set(row.mlsMediaKey, row.storedUrl);
    }

    for (const m of media) {
      if (!m.MediaURL) continue;
      const previouslyStored = storedByKey.get(m.MediaKey) ?? null;
      const storedUrl = previouslyStored
        ? previouslyStored
        : await downloadAndStorePhoto(m.MediaURL);

      await db
        .insert(listingPhotosTable)
        .values({
          listingId,
          mlsMediaKey: m.MediaKey,
          sourceUrl: m.MediaURL,
          storedUrl,
          caption: m.ShortDescription ?? null,
          order: m.Order ?? 0,
          width: m.ImageWidth ?? null,
          height: m.ImageHeight ?? null,
        })
        .onConflictDoUpdate({
          target: [listingPhotosTable.listingId, listingPhotosTable.mlsMediaKey],
          set: {
            sourceUrl: m.MediaURL,
            storedUrl,
            caption: m.ShortDescription ?? null,
            order: m.Order ?? 0,
            updatedAt: new Date(),
          },
        });
    }

    // Mirror onto listings.photoUrls for easy consumption by the site
    // renderer. Prefer the Object Storage path (`/objects/...`) so the
    // site serves photos from our own domain; fall back to the MLS
    // source URL if upload failed.
    const photos = await db
      .select({
        sourceUrl: listingPhotosTable.sourceUrl,
        storedUrl: listingPhotosTable.storedUrl,
        order: listingPhotosTable.order,
      })
      .from(listingPhotosTable)
      .where(eq(listingPhotosTable.listingId, listingId))
      .orderBy(listingPhotosTable.order);
    await db
      .update(listingsTable)
      .set({
        photoUrls: photos.map((p) => p.storedUrl ?? p.sourceUrl),
        updatedAt: new Date(),
      })
      .where(eq(listingsTable.id, listingId));
  } catch (err) {
    logger.warn({ err, listingId, listingKey }, "Failed to sync photos for listing");
  }
}

async function getOrInitState(boardId: string) {
  const [existing] = await db
    .select()
    .from(mlsSyncStateTable)
    .where(eq(mlsSyncStateTable.boardId, boardId));
  if (existing) return existing;
  const [inserted] = await db
    .insert(mlsSyncStateTable)
    .values({ boardId, totalListings: 0 })
    .returning();
  return inserted;
}

async function recordSuccess(boardId: string, kind: "full" | "delta", watermark: Date | null, total: number) {
  const set: Record<string, unknown> = {
    lastSuccessAt: new Date(),
    lastError: null,
    lastErrorAt: null,
    totalListings: total,
    updatedAt: new Date(),
    runId: null,
  };
  if (kind === "full") set.lastFullSyncAt = new Date();
  if (kind === "delta") set.lastDeltaSyncAt = new Date();
  if (watermark) set.lastDeltaWatermark = watermark;
  await db.update(mlsSyncStateTable).set(set).where(eq(mlsSyncStateTable.boardId, boardId));
}

async function recordError(boardId: string, err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  await db
    .update(mlsSyncStateTable)
    .set({ lastError: message, lastErrorAt: new Date(), runId: null, updatedAt: new Date() })
    .where(eq(mlsSyncStateTable.boardId, boardId));
}

export type SyncResult = {
  kind: "full" | "delta";
  configured: boolean;
  processed: number;
  totalListings: number;
  watermark: Date | null;
  durationMs: number;
};

export async function runSync(kind: "full" | "delta"): Promise<SyncResult> {
  const cfg = getMlsConfig();
  const start = Date.now();

  if (!cfg.configured) {
    logger.warn({ kind }, "Skipping MLS sync — not configured");
    return { kind, configured: false, processed: 0, totalListings: 0, watermark: null, durationMs: 0 };
  }

  const state = await getOrInitState(cfg.boardId);
  const runId = randomUUID();
  await db
    .update(mlsSyncStateTable)
    .set({ runId, updatedAt: new Date() })
    .where(eq(mlsSyncStateTable.boardId, cfg.boardId));

  let processed = 0;
  let maxWatermark: Date | null = state.lastDeltaWatermark ?? null;

  try {
    let filter: string | undefined;
    if (kind === "delta" && state.lastDeltaWatermark) {
      filter = `ModificationTimestamp gt ${state.lastDeltaWatermark.toISOString()}`;
    } else if (kind === "full") {
      filter = `StandardStatus eq 'Active'`;
    }

    // Track listings touched during this run so we photo-sync only what
    // changed (delta) or everything (full).
    const touched = new Map<string, string>(); // listingId -> mlsListingKey

    for await (const page of mlsClient.iterateProperties({ filter })) {
      for (const p of page) {
        const touchedId = await upsertProperty(p);
        if (touchedId) touched.set(touchedId, p.ListingKey);
        processed += 1;
        if (p.ModificationTimestamp) {
          const ts = new Date(p.ModificationTimestamp);
          if (!maxWatermark || ts > maxWatermark) maxWatermark = ts;
        }
      }
      logger.info({ runId, kind, processed }, "MLS sync progress");
    }

    // Photo sync: full sync covers every MLS listing in the DB; delta sync
    // only refreshes media for listings touched in this run. Both use the
    // same dedup path (unique on listing_id + mls_media_key).
    if (kind === "full") {
      const allWithKeys = await db
        .select({ id: listingsTable.id, mlsListingId: listingsTable.mlsListingId })
        .from(listingsTable)
        .where(sql`${listingsTable.mlsListingId} is not null`);
      for (const row of allWithKeys) {
        if (row.mlsListingId) await syncPhotos(row.id, row.mlsListingId);
      }
    } else {
      for (const [listingId, listingKey] of touched) {
        await syncPhotos(listingId, listingKey);
      }
    }

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(listingsTable)
      .where(sql`${listingsTable.mlsListingId} is not null`);

    await recordSuccess(cfg.boardId, kind, maxWatermark, count);
    return {
      kind,
      configured: true,
      processed,
      totalListings: count,
      watermark: maxWatermark,
      durationMs: Date.now() - start,
    };
  } catch (err) {
    if (err instanceof MlsNotConfiguredError) {
      return { kind, configured: false, processed: 0, totalListings: 0, watermark: null, durationMs: 0 };
    }
    logger.error({ err, runId, kind }, "MLS sync failed");
    await recordError(cfg.boardId, err);
    throw err;
  }
}

export async function getSyncStatus() {
  const cfg = getMlsConfig();
  const state = cfg.configured
    ? (await db.select().from(mlsSyncStateTable).where(eq(mlsSyncStateTable.boardId, cfg.boardId)))[0] ?? null
    : null;
  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(listingsTable)
    .where(sql`${listingsTable.mlsListingId} is not null`);
  return {
    configured: cfg.configured,
    boardId: cfg.boardId,
    deltaIntervalMs: cfg.deltaIntervalMs,
    propertyResource: cfg.propertyResource,
    mediaResource: cfg.mediaResource,
    state,
    totalMlsListings: total,
  };
}
