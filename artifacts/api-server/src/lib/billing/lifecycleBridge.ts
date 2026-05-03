import { db, listingsTable, agentsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { mlsEventBus, type ListingStatusChangedEvent } from "../mls/eventBus.js";
import { cancelListingSubscription } from "../stripe/index.js";
import { handleListingClosed, type ListingCloseStatus } from "../cloudflare/lifecycle.js";
import { logger } from "../logger.js";

/**
 * Terminal MLS statuses that should end a listing's subscription and
 * flip its custom domain over to a redirect. We accept a few common
 * spellings the MLS feed may send.
 */
const TERMINAL_STATUS_MAP: Record<string, ListingCloseStatus> = {
  sold: "Sold",
  closed: "Sold",
  withdrawn: "Withdrawn",
  cancelled: "Withdrawn",
  canceled: "Withdrawn",
  expired: "Expired",
};

function normalizeStatus(s: string): ListingCloseStatus | null {
  return TERMINAL_STATUS_MAP[s.trim().toLowerCase()] ?? null;
}

async function onStatusChanged(event: ListingStatusChangedEvent): Promise<void> {
  const closeStatus = normalizeStatus(event.toStatus);
  if (!closeStatus) return;

  const log = logger.child({
    listingId: event.listingId,
    fromStatus: event.fromStatus,
    toStatus: event.toStatus,
    closeStatus,
  });

  log.info("MLS lifecycle bridge: terminal status — winding down listing");

  const listings = await db
    .select()
    .from(listingsTable)
    .where(eq(listingsTable.id, event.listingId))
    .limit(1);
  const listing = listings[0];
  if (!listing) {
    log.warn("Listing not found in DB — nothing to wind down");
    return;
  }

  // Cancel the Stripe subscription (if any). Webhook
  // `customer.subscription.deleted` will then mark site mode=disabled
  // and status=closed, so we don't need to duplicate that DB write here.
  if (listing.stripeSubscriptionId) {
    try {
      await cancelListingSubscription(listing.stripeSubscriptionId);
      log.info({ subscriptionId: listing.stripeSubscriptionId }, "Stripe subscription cancelled");
    } catch (err) {
      log.error({ err }, "Failed to cancel Stripe subscription (continuing with DNS lifecycle)");
    }
  }

  // Always reflect MLS reality on the listing row even if Stripe was
  // never wired up (preview-only listings still need closedReason set).
  await db
    .update(listingsTable)
    .set({
      status: "closed",
      mlsStatus: event.toStatus,
      closedReason: closeStatus,
      updatedAt: new Date(),
    })
    .where(eq(listingsTable.id, listing.id));

  // Look up the agent's personal site (if any) for the redirect target.
  let agentWebsiteUrl: string | undefined;
  if (listing.agentId) {
    const agents = await db
      .select()
      .from(agentsTable)
      .where(eq(agentsTable.id, listing.agentId))
      .limit(1);
    agentWebsiteUrl = agents[0]?.personalWebsiteUrl ?? undefined;
  }

  try {
    const result = await handleListingClosed(listing.id, closeStatus, agentWebsiteUrl);
    if (result.success) {
      log.info({ redirectedTo: result.redirectedTo }, "Domain flipped to lifecycle redirect");
    } else {
      log.warn({ reason: result.reason }, "Domain lifecycle redirect skipped");
    }
  } catch (err) {
    log.error({ err }, "handleListingClosed threw");
  }
}

let initialized = false;

/**
 * Wire the MLS event bus to billing + DNS lifecycle. Idempotent — safe
 * to call multiple times during hot-reload.
 */
export function initBillingLifecycleBridge(): void {
  if (initialized) return;
  initialized = true;
  mlsEventBus.on("listing.status_changed", (event) => {
    onStatusChanged(event).catch((err) => {
      logger.error({ err, event }, "Unhandled error in lifecycle bridge");
    });
  });
  logger.info("Billing lifecycle bridge initialized — listening for listing.status_changed");
}
