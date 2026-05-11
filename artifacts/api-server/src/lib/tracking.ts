import { db, emailClickEventsTable } from "@workspace/db";
import { randomUUID } from "node:crypto";

const BASE_URL =
  process.env.MARKETING_SITE_URL ??
  process.env.PLATFORM_HOMEPAGE_URL ??
  "https://app.propsite.io";

export interface TrackingLinkParams {
  agentEmail: string;
  listingId?: string | null;
  linkType: string;
  destinationUrl: string;
}

/**
 * Insert a click-event row and return the tracking URL.
 * The token is a fresh UUID each call — old tokens from re-rendered
 * digest emails simply never get clicked and are harmless.
 */
export async function createTrackingUrl(
  params: TrackingLinkParams,
  tx: typeof db = db,
): Promise<string> {
  const token = randomUUID();
  await tx.insert(emailClickEventsTable).values({
    token,
    agentEmail: params.agentEmail,
    listingId: params.listingId ?? null,
    linkType: params.linkType,
    destinationUrl: params.destinationUrl,
  });
  return `${BASE_URL}/api/t/${token}`;
}

/**
 * Convenience: create preview + activate tracking URLs for one listing
 * in a single call. Returns { previewUrl, activateUrl } as tracking URLs.
 */
export async function createListingTrackingUrls(
  params: {
    agentEmail: string;
    listingId: string;
    rawPreviewUrl: string;
    rawActivateUrl: string;
  },
  tx: typeof db = db,
): Promise<{ previewUrl: string; activateUrl: string }> {
  const [previewUrl, activateUrl] = await Promise.all([
    createTrackingUrl(
      {
        agentEmail: params.agentEmail,
        listingId: params.listingId,
        linkType: "preview",
        destinationUrl: params.rawPreviewUrl,
      },
      tx,
    ),
    createTrackingUrl(
      {
        agentEmail: params.agentEmail,
        listingId: params.listingId,
        linkType: "activate",
        destinationUrl: params.rawActivateUrl,
      },
      tx,
    ),
  ]);
  return { previewUrl, activateUrl };
}
