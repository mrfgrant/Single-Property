import { logger } from "../logger.js";
import { getMlsConfig } from "./config.js";
import { runSync } from "./sync.js";
import { logMlsStatus } from "./client.js";

let timer: NodeJS.Timeout | null = null;
let running = false;

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
