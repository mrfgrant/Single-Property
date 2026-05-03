/**
 * MLS configuration sourced from environment variables.
 *
 * Required for live ingestion:
 *   MLS_BASE_URL        — RESO Web API base URL for the configured board
 *   MLS_ACCESS_TOKEN    — OAuth2 bearer token for the RESO endpoint
 *   MLS_BOARD_ID        — Board identifier prefix used by Task #4 for
 *                         out-of-market agent validation
 *
 * Optional:
 *   MLS_DELTA_INTERVAL_MS    — Poll interval (default 15 minutes)
 *   MLS_FULL_SYNC_ON_BOOT    — "true" to run a full sync on server startup
 *   MLS_MAX_PHOTOS_PER_LISTING — Default 25
 *   MLS_PROPERTY_RESOURCE    — RESO resource name (default "Property")
 *   MLS_MEDIA_RESOURCE       — RESO resource name (default "Media")
 */
export type MlsConfig = {
  configured: boolean;
  baseUrl: string | null;
  accessToken: string | null;
  boardId: string;
  deltaIntervalMs: number;
  fullSyncOnBoot: boolean;
  maxPhotosPerListing: number;
  propertyResource: string;
  mediaResource: string;
};

export function getMlsConfig(): MlsConfig {
  const baseUrl = process.env.MLS_BASE_URL?.trim() || null;
  const accessToken = process.env.MLS_ACCESS_TOKEN?.trim() || null;
  const boardId = process.env.MLS_BOARD_ID?.trim() || "UNCONFIGURED";
  const deltaIntervalMs = Number(process.env.MLS_DELTA_INTERVAL_MS ?? 15 * 60_000);
  const fullSyncOnBoot = (process.env.MLS_FULL_SYNC_ON_BOOT ?? "").toLowerCase() === "true";
  const maxPhotosPerListing = Number(process.env.MLS_MAX_PHOTOS_PER_LISTING ?? 25);
  const propertyResource = process.env.MLS_PROPERTY_RESOURCE?.trim() || "Property";
  const mediaResource = process.env.MLS_MEDIA_RESOURCE?.trim() || "Media";

  return {
    configured: Boolean(baseUrl && accessToken),
    baseUrl,
    accessToken,
    boardId,
    deltaIntervalMs: Number.isFinite(deltaIntervalMs) && deltaIntervalMs > 0
      ? deltaIntervalMs
      : 15 * 60_000,
    fullSyncOnBoot,
    maxPhotosPerListing: Number.isFinite(maxPhotosPerListing) && maxPhotosPerListing > 0
      ? maxPhotosPerListing
      : 25,
    propertyResource,
    mediaResource,
  };
}

export const TERMINAL_MLS_STATUSES = new Set([
  "Sold",
  "Closed",
  "Withdrawn",
  "Expired",
  "Cancelled",
  "Canceled",
]);

export function isTerminalStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  return TERMINAL_MLS_STATUSES.has(status);
}

export function normalizeStatus(mlsStatus: string | null | undefined): "active" | "closed" | "pending" {
  if (!mlsStatus) return "pending";
  if (isTerminalStatus(mlsStatus)) return "closed";
  if (mlsStatus === "Active" || mlsStatus === "Coming Soon") return "active";
  return "pending";
}
