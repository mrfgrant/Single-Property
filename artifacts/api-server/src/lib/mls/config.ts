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
  // Provider bridge: when MLS_PROVIDER=sourcere, allow the SourceRE-
  // specific secret name SOURCERE_JWT to satisfy MLS_ACCESS_TOKEN, and
  // fall back to the documented SourceRE OData base URL. This lets the
  // existing RESO Web API plumbing (which is OData 4.0 under the hood)
  // talk to the SourceRE feed without renaming any existing env vars.
  const provider = (process.env.MLS_PROVIDER?.trim() || "").toLowerCase();
  const isSourceRe = provider === "sourcere";

  const baseUrl =
    process.env.MLS_BASE_URL?.trim() ||
    (isSourceRe ? process.env.SOURCERE_BASE_URL?.trim() || null : null);
  const accessToken =
    process.env.MLS_ACCESS_TOKEN?.trim() ||
    (isSourceRe ? process.env.SOURCERE_JWT?.trim() || null : null);
  // Default to "AUG" (Augusta) when not explicitly set — this matches
  // the same default used by routes/onboarding.ts for out-of-market
  // agent validation, so the two code paths agree on market identity
  // out-of-the-box for the CSRA/Augusta deployment without requiring
  // operators to set the secret manually.
  const boardIdRaw = process.env.MLS_BOARD_ID?.trim() || "AUG";
  const boardId = boardIdRaw;

  // Operator hint: when MLS_PROVIDER=sourcere is set but the OData base
  // URL hasn't been provided, the integration silently stays unconfigured.
  // We intentionally don't hard-code a SourceRE URL default because the
  // canonical endpoint is per-tenant — the operator must paste theirs
  // from the SourceRE portal — but we surface a clear hint so this
  // doesn't get diagnosed as a credential problem.
  if (isSourceRe && accessToken && !baseUrl) {
    // eslint-disable-next-line no-console
    console.warn(
      "[mls] MLS_PROVIDER=sourcere with SOURCERE_JWT set, but no base URL — set MLS_BASE_URL (or SOURCERE_BASE_URL) to your SourceRE OData endpoint to enable MLS sync.",
    );
  }
  // "Configured" means we can actually call the MLS feed: we need a
  // base URL and an access token. The board id always has a sensible
  // default (see above), so it doesn't gate configured-ness.
  const fullyConfigured = Boolean(baseUrl && accessToken);
  const deltaIntervalMs = Number(process.env.MLS_DELTA_INTERVAL_MS ?? 15 * 60_000);
  const fullSyncOnBoot = (process.env.MLS_FULL_SYNC_ON_BOOT ?? "").toLowerCase() === "true";
  const maxPhotosPerListing = Number(process.env.MLS_MAX_PHOTOS_PER_LISTING ?? 25);
  const propertyResource = process.env.MLS_PROPERTY_RESOURCE?.trim() || "Property";
  const mediaResource = process.env.MLS_MEDIA_RESOURCE?.trim() || "Media";

  return {
    configured: fullyConfigured,
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
