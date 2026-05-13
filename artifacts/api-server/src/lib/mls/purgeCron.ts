import {
  db,
  listingsTable,
  listingPhotosTable,
  listingStatusEventsTable,
  sitesTable,
  emailOutboxTable,
  smsOutboxTable,
} from "@workspace/db";
import { and, eq, isNull, sql } from "drizzle-orm";
import { logger } from "../logger.js";
import { ObjectStorageService, ObjectNotFoundError } from "../objectStorage.js";

const log = logger.child({ component: "purge-unclaimed" });

const RETENTION_DAYS = Number(process.env.PREVIEW_RETENTION_DAYS ?? 30);
const CLOSED_GRACE_DAYS = Number(process.env.CLOSED_LISTING_GRACE_DAYS ?? 7);
const TICK_MS = Number(process.env.PURGE_UNCLAIMED_TICK_MS ?? 24 * 60 * 60 * 1000); // daily
const CLOSED_PURGE_BATCH = Number(process.env.CLOSED_PURGE_BATCH ?? 500);

const objectStorage = new ObjectStorageService();

/**
 * Delete a single Object-Storage-backed photo by its `/objects/<entityId>`
 * canonical path. Best-effort: missing files are treated as success;
 * unexpected errors are logged but never thrown so one bad blob can't
 * stall the whole purge.
 */
async function deletePhotoBlob(storedUrl: string): Promise<void> {
  try {
    const file = await objectStorage.getObjectEntityFile(storedUrl);
    await file.delete({ ignoreNotFound: true });
  } catch (err) {
    if (err instanceof ObjectNotFoundError) return;
    log.warn({ err, storedUrl }, "Failed to delete photo blob — continuing");
  }
}

/**
 * Shared per-listing purge logic: delete photo blobs, remove dependent
 * rows, tombstone the listing, and cancel pending outbox messages.
 * Returns true on success, false if an error was caught (already logged).
 */
async function purgeOneListing(
  row: { id: string; address: string },
  reason: string,
): Promise<boolean> {
  try {
    // 1. Delete the actual blobs.
    const photos = await db
      .select({ storedUrl: listingPhotosTable.storedUrl })
      .from(listingPhotosTable)
      .where(eq(listingPhotosTable.listingId, row.id));
    for (const p of photos) {
      if (p.storedUrl && p.storedUrl.startsWith("/objects/")) {
        await deletePhotoBlob(p.storedUrl);
      }
    }

    // 2. Remove dependent rows (FK cascades only fire on hard DELETE of
    //    the listing row; we keep it as a tombstone to prevent MLS sync
    //    from re-creating it on the next delta, so we clean up manually).
    await db.delete(sitesTable).where(eq(sitesTable.listingId, row.id));
    await db
      .delete(listingStatusEventsTable)
      .where(eq(listingStatusEventsTable.listingId, row.id));
    await db
      .delete(listingPhotosTable)
      .where(eq(listingPhotosTable.listingId, row.id));

    // 3. Tombstone the listing itself.
    await db
      .update(listingsTable)
      .set({
        purgedAt: new Date(),
        purgedReason: reason,
        photoUrls: [],
        updatedAt: new Date(),
      })
      .where(eq(listingsTable.id, row.id));

    // 4. Cancel any still-pending outbox messages for this listing.
    await db.execute(sql`
      UPDATE ${emailOutboxTable}
         SET status = 'cancelled', last_error = 'listing_purged', updated_at = NOW()
       WHERE status = 'pending'
         AND (
           metadata->>'listingId' = ${row.id}
           OR (metadata->'listingIds') ? ${row.id}
         )
    `);
    await db.execute(sql`
      UPDATE ${smsOutboxTable}
         SET status = 'cancelled', last_error = 'listing_purged', updated_at = NOW()
       WHERE status = 'pending'
         AND metadata->>'listingId' = ${row.id}
    `);

    return true;
  } catch (err) {
    log.error({ err, listingId: row.id }, "Failed to purge listing — continuing");
    return false;
  }
}

/**
 * Purge closed/expired listings that were never claimed by an agent.
 * Runs after the unclaimed-preview pass in the same daily tick.
 * A 7-day grace period (CLOSED_LISTING_GRACE_DAYS) lets any final
 * marketing-report emails send before the row disappears.
 * Processes at most CLOSED_PURGE_BATCH rows per tick so the first
 * run (which has ~9,980 rows to drain) doesn't overwhelm the DB.
 */
async function purgeClosedListings(): Promise<{ purged: number }> {
  const closedCutoff = new Date(Date.now() - CLOSED_GRACE_DAYS * 24 * 60 * 60 * 1000);

  const stale = await db
    .select({
      id: listingsTable.id,
      address: listingsTable.address,
    })
    .from(listingsTable)
    .where(
      and(
        eq(listingsTable.status, "closed"),
        isNull(listingsTable.agentId),
        isNull(listingsTable.stripeSubscriptionId),
        isNull(listingsTable.purgedAt),
        // Grace period: only purge once the listing has been closed for at
        // least CLOSED_GRACE_DAYS. Use mlsLastSyncedAt (most accurate) and
        // fall back to updatedAt if that column is null.
        sql`COALESCE(${listingsTable.mlsLastSyncedAt}, ${listingsTable.updatedAt}) < ${closedCutoff}`,
      ),
    )
    .limit(CLOSED_PURGE_BATCH);

  if (stale.length === 0) return { purged: 0 };
  log.warn({ count: stale.length, closedCutoff, batch: CLOSED_PURGE_BATCH }, "Purging closed unclaimed listings");

  let purged = 0;
  for (const row of stale) {
    const ok = await purgeOneListing(row, "closed_listing_retention");
    if (ok) {
      purged += 1;
      log.info({ listingId: row.id, address: row.address }, "Purged closed listing");
    }
  }
  log.warn({ purged, considered: stale.length }, "Closed-listing purge pass complete");
  return { purged };
}

/**
 * Purge tick. Finds preview listings older than the retention window
 * that have never been claimed by an agent, deletes their photo blobs
 * from Object Storage, marks the row purged (cascades drop photos /
 * sites / status events via FK), and cleans up any still-pending outbox
 * messages tied to the listing.
 */
async function runOneTick(): Promise<{ purged: number }> {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const stale = await db
    .select({
      id: listingsTable.id,
      address: listingsTable.address,
    })
    .from(listingsTable)
    .where(
      and(
        // Mode must still be "preview" — once a listing has been
        // upgraded to "live" or "disabled" it represents a paying or
        // formerly-paying customer and is never auto-purged.
        eq(listingsTable.mode, "preview"),
        isNull(listingsTable.agentId),
        isNull(listingsTable.stripeSubscriptionId),
        isNull(listingsTable.purgedAt),
        sql`${listingsTable.createdAt} < ${cutoff}`,
      ),
    );

  let purged = 0;

  if (stale.length > 0) {
    log.info({ count: stale.length, cutoff }, "Found unclaimed preview listings to purge");
    for (const row of stale) {
      const ok = await purgeOneListing(row, "unclaimed_preview_retention");
      if (ok) {
        purged += 1;
        log.info({ listingId: row.id, address: row.address }, "Purged unclaimed preview listing");
      }
    }
    log.info({ purged, considered: stale.length }, "Unclaimed-preview purge pass complete");
  }

  // Second pass: purge closed/expired listings that were never claimed.
  const { purged: closedPurged } = await purgeClosedListings();
  purged += closedPurged;

  return { purged };
}

let timer: NodeJS.Timeout | null = null;

export function startPurgeUnclaimedCron(): void {
  if (timer) return;
  if (process.env.PURGE_UNCLAIMED_DISABLED === "1") {
    log.info("Unclaimed-preview purge cron disabled via env");
    return;
  }
  log.info({ retentionDays: RETENTION_DAYS, tickMs: TICK_MS }, "Unclaimed-preview purge cron started");
  const tick = () =>
    runOneTick().catch((err) => log.error({ err }, "Purge tick threw"));
  timer = setInterval(tick, TICK_MS);
  if (typeof timer.unref === "function") timer.unref();
  void tick();
}

export function stopPurgeUnclaimedCron(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

/** Exported for ops/tests — runs one purge pass synchronously. */
export const __runPurgeTickForTest = runOneTick;
