import {
  db,
  listingsTable,
  listingPhotosTable,
  emailOutboxTable,
  smsOutboxTable,
} from "@workspace/db";
import { and, eq, isNull, sql } from "drizzle-orm";
import { logger } from "../logger.js";
import { ObjectStorageService, ObjectNotFoundError } from "../objectStorage.js";

const log = logger.child({ component: "purge-unclaimed" });

const RETENTION_DAYS = Number(process.env.PREVIEW_RETENTION_DAYS ?? 30);
const TICK_MS = Number(process.env.PURGE_UNCLAIMED_TICK_MS ?? 24 * 60 * 60 * 1000); // daily

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
        eq(listingsTable.mode, "preview"),
        eq(listingsTable.status, "active"),
        isNull(listingsTable.agentId),
        isNull(listingsTable.stripeSubscriptionId),
        isNull(listingsTable.purgedAt),
        sql`${listingsTable.createdAt} < ${cutoff}`,
      ),
    );

  if (stale.length === 0) return { purged: 0 };
  log.info({ count: stale.length, cutoff }, "Found unclaimed preview listings to purge");

  let purged = 0;
  for (const row of stale) {
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

      // 2. Tombstone the listing. This cascade-deletes listing_photos,
      //    sites, listing_status_events via their FKs.
      await db
        .update(listingsTable)
        .set({
          purgedAt: new Date(),
          purgedReason: "unclaimed_preview_retention",
          // Clear photo URLs from the listing row itself.
          photoUrls: [],
          updatedAt: new Date(),
        })
        .where(eq(listingsTable.id, row.id));

      await db
        .delete(listingPhotosTable)
        .where(eq(listingPhotosTable.listingId, row.id));

      // 3. Cancel any still-pending outbox messages for this listing.
      //    The cold-outreach guard would also do this lazily, but
      //    cleaning up explicitly keeps the outbox tidy.
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

      purged += 1;
      log.info({ listingId: row.id, address: row.address }, "Purged unclaimed preview listing");
    } catch (err) {
      log.error({ err, listingId: row.id }, "Failed to purge listing — continuing");
    }
  }
  log.info({ purged, considered: stale.length }, "Purge tick complete");
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
