import { logger } from "../logger.js";
import { getMlsConfig } from "./config.js";
import { runSync, runPhotoBackfill } from "./sync.js";
import { logMlsStatus } from "./client.js";
import { db, mlsSyncStateTable } from "@workspace/db";
import { sendOperatorAlert } from "../operatorAlert.js";

let timer: NodeJS.Timeout | null = null;
let running = false;
let watchdogTimer: NodeJS.Timeout | null = null;

async function safeRun(kind: "full" | "delta") {
  if (running) {
    logger.info({ kind }, "MLS sync already running — skipping tick");
    return;
  }
  running = true;
  try {
    const result = await runSync(kind);
    logger.info(result, "MLS sync complete");
  } catch (err) {
    logger.error({ err, kind }, "MLS sync errored");
  } finally {
    running = false;
  }
}

/**
 * Boot the MLS ingestion loop. Safe to call when MLS env vars are missing —
 * it logs a warning and returns. Re-entrant: subsequent calls are no-ops.
 */
export function startMlsIngestion(): void {
  if (timer) return;
  logMlsStatus();
  const cfg = getMlsConfig();
  if (!cfg.configured) return;

  if (cfg.fullSyncOnBoot) {
    void safeRun("full");
  }

  timer = setInterval(() => {
    void safeRun("delta");
  }, cfg.deltaIntervalMs);
  // Don't keep the event loop alive solely for this timer.
  if (typeof timer.unref === "function") timer.unref();
  logger.info({ deltaIntervalMs: cfg.deltaIntervalMs }, "MLS delta sync scheduled");
}

export function stopMlsIngestion(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

const STALE_THRESHOLD_MS = 60 * 60 * 1000;
const WATCHDOG_INTERVAL_MS = 30 * 60 * 1000;

async function checkStaleSyncs(): Promise<void> {
  try {
    const rows = await db.select().from(mlsSyncStateTable);
    for (const row of rows) {
      const lastSuccess = row.lastSuccessAt ? new Date(row.lastSuccessAt) : null;
      const ageMs = lastSuccess ? Date.now() - lastSuccess.getTime() : null;
      if (ageMs === null || ageMs >= STALE_THRESHOLD_MS) {
        const sinceStr = lastSuccess
          ? `${Math.round(ageMs! / 60_000)} minutes ago (${lastSuccess.toISOString()})`
          : "never";
        void sendOperatorAlert(
          `mls_stale_sync:${row.boardId}`,
          `MLS sync has not completed in over 1 hour — ${row.boardId} board`,
          [
            `Board:         ${row.boardId}`,
            `Last success:  ${sinceStr}`,
            `Last error:    ${row.lastError ?? "none recorded"}`,
            `Last error at: ${row.lastErrorAt ?? "—"}`,
            ``,
            `No listing updates or photos are coming through.`,
            `Agents may be receiving links to outdated or photo-less listings.`,
            ``,
            `Action: Check MLS provider status and server logs.`,
          ],
        );
      }
    }
  } catch (err) {
    logger.error({ err }, "Stale sync watchdog check failed");
  }
}

export function startStaleSyncWatchdog(): void {
  if (watchdogTimer) return;
  logger.info({ intervalMs: WATCHDOG_INTERVAL_MS }, "MLS stale-sync watchdog started");
  watchdogTimer = setInterval(() => void checkStaleSyncs(), WATCHDOG_INTERVAL_MS);
  if (typeof watchdogTimer.unref === "function") watchdogTimer.unref();
  void checkStaleSyncs();
}

const PHOTO_BACKFILL_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
let backfillTimer: NodeJS.Timeout | null = null;
let backfillRunning = false;

/**
 * Start the hourly photo backfill cron. Re-fetches MLS media for all
 * listings that currently have no photos and queues cold outreach when
 * photos are found for the first time.
 *
 * Deliberately does NOT fire immediately on boot — the MLS delta sync
 * handles the first-run case and we want the server to stabilize first.
 * The cron fires after the first full interval (1 hour).
 */
export function startPhotoBackfillCron(): void {
  if (backfillTimer) return;
  backfillTimer = setInterval(() => {
    if (backfillRunning) {
      logger.info("Photo backfill already running — skipping tick");
      return;
    }
    backfillRunning = true;
    runPhotoBackfill()
      .then((result) => logger.info(result, "Photo backfill cron complete"))
      .catch((err) => logger.error({ err }, "Photo backfill cron threw"))
      .finally(() => { backfillRunning = false; });
  }, PHOTO_BACKFILL_INTERVAL_MS);
  if (typeof backfillTimer.unref === "function") backfillTimer.unref();
  logger.info({ intervalMs: PHOTO_BACKFILL_INTERVAL_MS }, "Photo backfill cron started");
}

export function stopPhotoBackfillCron(): void {
  if (backfillTimer) {
    clearInterval(backfillTimer);
    backfillTimer = null;
  }
}
