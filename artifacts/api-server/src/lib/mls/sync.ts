import { db } from "@workspace/db";
import {
  listingsTable,
  listingPhotosTable,
  listingStatusEventsTable,
  mlsSyncStateTable,
  type Listing,
} from "@workspace/db/schema";
import { eq, inArray, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { logger } from "../logger.js";
import { mlsClient, MlsNotConfiguredError, type ResoProperty } from "./client.js";
import { mlsEventBus } from "./eventBus.js";
import { getMlsConfig, normalizeStatus } from "./config.js";
import { downloadAndStorePhoto } from "./photoUtils.js";
import { queueColdOutreachIfEligible } from "../outreach/coldOutreach.js";
import { sendOperatorAlert } from "../operatorAlert.js";

/**
 * Returns true for URLs that are actual image files.
 * R2 paths (/objects/...) are always images.
 * External URLs must have a recognised image extension.
 */
function isImageUrl(url: string | null | undefined): url is string {
  if (!url) return false;
  if (url.startsWith("/objects/")) return true;
  const IMAGE_EXT = /\.(jpe?g|png|webp|gif|avif|tiff?|bmp|svg)(\?.*)?$/i;
  return IMAGE_EXT.test(url);
}

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
    priceUsd: p.ListPrice != null ? Math.round(p.ListPrice) : null,
    beds: p.BedroomsTotal != null ? Math.round(p.BedroomsTotal) : null,
    baths: p.BathroomsTotalDecimal != null ? Math.round(p.BathroomsTotalDecimal) : p.BathroomsTotalInteger != null ? Math.round(p.BathroomsTotalInteger) : null,
    // SourceRE populates BuildingAreaTotal; LivingArea is almost always null.
    // Round to integer — the DB column is integer and SourceRE can return floats.
    sqft: Math.round(p.BuildingAreaTotal ?? p.LivingArea ?? p.AboveGradeFinishedArea ?? 0) || null,
    lotAcres: p.LotSizeAcres ?? null,
    yearBuilt: p.YearBuilt != null ? Math.round(p.YearBuilt) : null,
    description: p.PublicRemarks ?? null,
    status,
    mlsStatus: p.StandardStatus ?? p.MlsStatus ?? null,
    mlsModificationTimestamp: p.ModificationTimestamp ? new Date(p.ModificationTimestamp) : null,
    mlsListDate: p.ListingContractDate ?? null,
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
  // MLS contract date drives the 15-day cold-outreach age gate. Tracking
  // it ensures existing rows get backfilled when the MLS feed starts
  // supplying ListingContractDate on a subsequent delta sync.
  "mlsListDate",
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
 * Upsert a single MLS property and return { id, isNew } if the row was
 * touched (inserted or updated), otherwise null. `isNew` lets the caller
 * trigger a cold-outreach photo refresh after photos are synced for the
 * first time — the initial cold-outreach email is rendered before photos
 * are available, so we patch it immediately after syncPhotos() completes.
 */
async function upsertProperty(p: ResoProperty, syncKind: "full" | "delta"): Promise<{ id: string; isNew: boolean } | null> {
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
        mlsListDate: mapped.mlsListDate ?? undefined,
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
      isNew: syncKind === "delta",
      changedFields: TRACKED_FIELDS.map(String),
      syncKind,
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
    return { id: inserted.id, isNew: true };
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
        // Backfill mlsListDate for rows ingested before the column existed.
        mlsListDate: mapped.mlsListDate ?? existing.mlsListDate,
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
    syncKind,
  });
  return { id: updated.id, isNew: false };
}

/**
 * Fetch and store photos for a listing from the MLS media feed.
 *
 * Returns true when photos were **newly** stored in this call — i.e. the
 * listing had zero confirmed image URLs before this sync and now has at
 * least one. Returns false when the listing already had photos, when no
 * images were found, or when the sync fails.
 *
 * Callers use the return value to decide whether to trigger cold-outreach
 * queueing for the first time (rather than patching existing HTML).
 */
async function syncPhotos(listingId: string, listingKey: string): Promise<boolean> {
  try {
    // Fetch prior state and MLS media in parallel.
    // - existingMedia: which mediaKeys we already stored so we don't re-download
    // - listingRow: the current photoUrls array (includes both R2-stored and
    //   source-URL fallbacks) — used to accurately detect "photos newly arrived"
    const [media, existingMedia, listingRow] = await Promise.all([
      mlsClient.fetchMediaForListing(listingKey),
      db
        .select({ mlsMediaKey: listingPhotosTable.mlsMediaKey, storedUrl: listingPhotosTable.storedUrl })
        .from(listingPhotosTable)
        .where(eq(listingPhotosTable.listingId, listingId)),
      db
        .select({ photoUrls: listingsTable.photoUrls })
        .from(listingsTable)
        .where(eq(listingsTable.id, listingId))
        .limit(1),
    ]);

    if (media.length === 0) return false;

    // True when the listing already had at least one resolved photo URL
    // (stored or source-URL fallback) before this sync run.
    const prevHadPhotos = (listingRow[0]?.photoUrls?.length ?? 0) > 0;

    // Look up which mediaKeys we already have a stored copy for, so we
    // don't re-download photos that haven't changed.
    const storedByKey = new Map<string, string | null>();
    for (const row of existingMedia) {
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

    const imageUrls = photos.map((p) => p.storedUrl ?? p.sourceUrl).filter(isImageUrl);

    await db
      .update(listingsTable)
      .set({ photoUrls: imageUrls, updatedAt: new Date() })
      .where(eq(listingsTable.id, listingId));

    // Photos are "newly added" when there were none before but there are now.
    // We use the listing-level photoUrls (which includes source-URL fallbacks)
    // as the "before" state to avoid false positives when photos existed via
    // fallback but lacked a confirmed stored_url in listing_photos.
    return !prevHadPhotos && imageUrls.length > 0;
  } catch (err) {
    logger.warn({ err, listingId, listingKey }, "Failed to sync photos for listing");
    return false;
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
  let message: string;
  if (err instanceof Error) {
    // Drizzle wraps the pg error in err.cause — prefer that as the summary.
    const cause = (err as any).cause;
    const rootMsg = cause instanceof Error ? cause.message : null;
    if (rootMsg) {
      // e.g. "integer out of range — insert into listings (…)"
      const sqlSnippet = err.message.split("\n")[0].replace(/^Failed query:\s*/i, "").slice(0, 100);
      message = sqlSnippet ? `${rootMsg} — ${sqlSnippet}` : rootMsg;
    } else {
      message = err.message;
    }
  } else {
    message = String(err);
  }
  await db
    .update(mlsSyncStateTable)
    .set({ lastError: message, lastErrorAt: new Date(), runId: null, updatedAt: new Date() })
    .where(eq(mlsSyncStateTable.boardId, boardId));

  void sendOperatorAlert(
    `mls_sync_error:${boardId}`,
    `MLS sync error — ${boardId} board`,
    [
      `Board:     ${boardId}`,
      `Error:     ${message}`,
      `Time:      ${new Date().toISOString()}`,
      ``,
      `The MLS delta sync is failing. No listing updates or photo syncs`,
      `will come through until this is resolved.`,
      ``,
      `Action: Check the MLS provider status and review server logs.`,
    ],
  );
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
      // Subsequent delta: fetch anything modified since the last watermark,
      // regardless of status (catches listings that went off-market too).
      filter = `ModificationTimestamp gt ${state.lastDeltaWatermark.toISOString()}`;
    } else {
      // First-ever delta (no watermark yet) OR full sync: restrict to Active
      // listings only so we don't ingest the entire MLS history on boot.
      filter = `StandardStatus eq 'Active'`;
    }

    // Track listings touched during this run so we photo-sync only what
    // changed (delta) or everything (full). isNew drives the post-photo
    // cold-outreach refresh that patches the pre-rendered email HTML once
    // photos are available.
    const touched = new Map<string, { listingKey: string; isNew: boolean }>();

    let skipped = 0;
    for await (const page of mlsClient.iterateProperties({ filter })) {
      for (const p of page) {
        try {
          const result = await upsertProperty(p, kind);
          if (result) touched.set(result.id, { listingKey: p.ListingKey, isNew: result.isNew });
          processed += 1;
          if (p.ModificationTimestamp) {
            const ts = new Date(p.ModificationTimestamp);
            if (!maxWatermark || ts > maxWatermark) maxWatermark = ts;
          }
        } catch (err: any) {
          // Skip individual listings that fail (e.g. integer overflow on malformed
          // MLS data) so one bad record cannot abort the entire sync run.
          skipped += 1;
          logger.warn(
            { err: err?.message ?? String(err), listingKey: p.ListingKey, listingId: p.ListingId },
            "Skipping listing due to upsert error — bad MLS data",
          );
          // Still advance the watermark past this record so we don't
          // re-process it on every subsequent delta run.
          if (p.ModificationTimestamp) {
            const ts = new Date(p.ModificationTimestamp);
            if (!maxWatermark || ts > maxWatermark) maxWatermark = ts;
          }
        }
      }
      logger.info({ runId, kind, processed, skipped }, "MLS sync progress");
    }

    // Photo sync: full sync covers every MLS listing in the DB; delta sync
    // only refreshes media for listings touched in this run. Both use the
    // same dedup path (unique on listing_id + mls_media_key).
    //
    // When syncPhotos() returns true (photos newly stored for the first time),
    // we trigger cold-outreach queueing for that listing. Outreach is ONLY
    // queued once confirmed media exists — never at ingest time.
    if (kind === "full") {
      const allWithKeys = await db
        .select({ id: listingsTable.id, mlsListingId: listingsTable.mlsListingId })
        .from(listingsTable)
        .where(sql`${listingsTable.mlsListingId} is not null`);
      for (const row of allWithKeys) {
        if (row.mlsListingId) {
          const photosNewlyAdded = await syncPhotos(row.id, row.mlsListingId);
          if (photosNewlyAdded) {
            try {
              await queueColdOutreachIfEligible(row.id, { calledAfterPhotoSync: true });
            } catch (err) {
              logger.warn({ err, listingId: row.id }, "Cold-outreach queue after photo sync failed — non-fatal");
            }
          }
        }
      }
    } else {
      for (const [listingId, { listingKey }] of touched) {
        const photosNewlyAdded = await syncPhotos(listingId, listingKey);
        if (photosNewlyAdded) {
          try {
            await queueColdOutreachIfEligible(listingId, { calledAfterPhotoSync: true });
          } catch (err) {
            logger.warn({ err, listingId }, "Cold-outreach queue after photo sync failed — non-fatal");
          }
        }
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

/**
 * Re-fetch MLS media for all active listings that currently have no photos.
 * Called by the hourly backfill cron. Rate-limited to 50ms between listings
 * to avoid hammering the MLS CDN.
 *
 * When a listing that previously had no photos now gets images stored,
 * queueColdOutreachIfEligible() is called so outreach fires immediately
 * (subject to age-gate and suppression checks).
 */
export async function runPhotoBackfill(): Promise<{ synced: number; total: number }> {
  const cfg = getMlsConfig();
  if (!cfg.configured) return { synced: 0, total: 0 };

  const noPhotoListings = await db
    .select({ id: listingsTable.id, mlsListingId: listingsTable.mlsListingId })
    .from(listingsTable)
    .where(
      sql`${listingsTable.mlsListingId} IS NOT NULL
        AND ${listingsTable.purgedAt} IS NULL
        AND ${listingsTable.status} = 'active'
        AND (${listingsTable.photoUrls} IS NULL OR array_length(${listingsTable.photoUrls}, 1) IS NULL)`,
    );

  const total = noPhotoListings.length;
  let synced = 0;

  for (const row of noPhotoListings) {
    if (!row.mlsListingId) continue;
    try {
      const photosNewlyAdded = await syncPhotos(row.id, row.mlsListingId);
      if (photosNewlyAdded) {
        synced++;
        await queueColdOutreachIfEligible(row.id, { calledAfterPhotoSync: true }).catch((err) =>
          logger.warn({ err, listingId: row.id }, "Cold-outreach queue after backfill failed — non-fatal"),
        );
      }
    } catch (err) {
      logger.warn({ err, listingId: row.id }, "Photo backfill failed for listing — skipping");
    }
    // Rate-limit: 50ms between listings to avoid hammering the MLS CDN.
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
  }

  logger.info({ synced, total }, "Photo backfill complete");
  return { synced, total };
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
