import { db } from "@workspace/db";
import {
  listingsTable,
  listingPhotosTable,
  listingStatusEventsTable,
  mlsSyncStateTable,
  type Listing,
} from "@workspace/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { logger } from "../logger.js";
import { mlsClient, MlsNotConfiguredError, type ResoProperty } from "./client.js";
import { mlsEventBus } from "./eventBus.js";
import { getMlsConfig, normalizeStatus } from "./config.js";

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
    sqft: p.LivingArea ?? null,
    lotAcres: p.LotSizeAcres ?? null,
    yearBuilt: p.YearBuilt ?? null,
    description: p.PublicRemarks ?? null,
    status,
    mlsStatus: p.StandardStatus ?? p.MlsStatus ?? null,
    mlsModificationTimestamp: p.ModificationTimestamp ? new Date(p.ModificationTimestamp) : null,
    updatedAt: new Date(),
  };
}

const TRACKED_FIELDS: (keyof Listing)[] = [
  "address", "city", "state", "zip",
  "priceUsd", "beds", "baths", "sqft", "lotAcres", "yearBuilt",
  "description", "listAgentMlsId", "mlsStatus", "status",
];

function diffFields(prev: Listing, next: Partial<Listing>): string[] {
  const changed: string[] = [];
  for (const f of TRACKED_FIELDS) {
    if (next[f] !== undefined && next[f] !== prev[f]) changed.push(String(f));
  }
  return changed;
}

async function upsertProperty(p: ResoProperty): Promise<void> {
  const mapped = mapResoToListing(p);
  const [existing] = await db
    .select()
    .from(listingsTable)
    .where(eq(listingsTable.mlsListingId, mapped.mlsListingId));

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
        source: "mls",
        occurredAt: new Date(),
      });
    }
    return;
  }

  const changed = diffFields(existing, mapped);
  if (changed.length === 0) return;

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
}

async function syncPhotos(listingId: string, listingKey: string): Promise<void> {
  try {
    const media = await mlsClient.fetchMediaForListing(listingKey);
    if (media.length === 0) return;

    for (const m of media) {
      if (!m.MediaURL) continue;
      await db
        .insert(listingPhotosTable)
        .values({
          listingId,
          mlsMediaKey: m.MediaKey,
          sourceUrl: m.MediaURL,
          caption: m.ShortDescription ?? null,
          order: m.Order ?? 0,
          width: m.ImageWidth ?? null,
          height: m.ImageHeight ?? null,
        })
        .onConflictDoUpdate({
          target: [listingPhotosTable.listingId, listingPhotosTable.mlsMediaKey],
          set: {
            sourceUrl: m.MediaURL,
            caption: m.ShortDescription ?? null,
            order: m.Order ?? 0,
            updatedAt: new Date(),
          },
        });
    }

    // Mirror onto listings.photoUrls for easy consumption by site renderer.
    const photos = await db
      .select({ url: listingPhotosTable.sourceUrl, order: listingPhotosTable.order })
      .from(listingPhotosTable)
      .where(eq(listingPhotosTable.listingId, listingId))
      .orderBy(listingPhotosTable.order);
    await db
      .update(listingsTable)
      .set({ photoUrls: photos.map((p) => p.url), updatedAt: new Date() })
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

    for await (const page of mlsClient.iterateProperties({ filter })) {
      for (const p of page) {
        await upsertProperty(p);
        processed += 1;
        if (p.ModificationTimestamp) {
          const ts = new Date(p.ModificationTimestamp);
          if (!maxWatermark || ts > maxWatermark) maxWatermark = ts;
        }
      }
      logger.info({ runId, kind, processed }, "MLS sync progress");
    }

    // Photo sync for newly-touched listings is handled lazily on a slow loop
    // here — full sync grabs everything, delta only what changed.
    if (kind === "full") {
      const allWithKeys = await db
        .select({ id: listingsTable.id, mlsListingId: listingsTable.mlsListingId })
        .from(listingsTable)
        .where(sql`${listingsTable.mlsListingId} is not null`);
      for (const row of allWithKeys) {
        if (row.mlsListingId) await syncPhotos(row.id, row.mlsListingId);
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

// Suppress unused-import warning when downstream tasks haven't wired the bus yet.
void and;
