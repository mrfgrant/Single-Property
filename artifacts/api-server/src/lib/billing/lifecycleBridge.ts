import { db, listingsTable, agentsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { mlsEventBus, type ListingStatusChangedEvent } from "../mls/eventBus.js";
import { cancelListingSubscription } from "../stripe/index.js";
import { handleListingClosed, type ListingCloseStatus } from "../cloudflare/lifecycle.js";
import { logger } from "../logger.js";
import { enqueueEmail } from "../outbox/email.js";
import { listingArchivedEmail } from "../email.js";
import { getFinalMarketingStats } from "../analytics/aggregate.js";
import { renderFinalMarketingReport } from "../analytics/report.js";

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
  // Prefer the raw vendor MLS status to disambiguate subtypes the
  // normalized DB enum collapses (e.g. "Closed" vs "Sold" both become
  // `closed` in our enum but mean different things to the agent).
  const rawSubtype = event.mlsStatus?.trim() || event.toStatus;
  const closeStatus =
    normalizeStatus(rawSubtype) ?? normalizeStatus(event.toStatus);
  if (!closeStatus) return;

  const log = logger.child({
    listingId: event.listingId,
    fromStatus: event.fromStatus,
    toStatus: event.toStatus,
    mlsStatus: event.mlsStatus,
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
  // Preserve the raw vendor MLS status so we don't clobber subtype
  // information with our normalized enum value.
  await db
    .update(listingsTable)
    .set({
      status: "closed",
      mlsStatus: event.mlsStatus ?? listing.mlsStatus ?? event.toStatus,
      closedReason: closeStatus,
      updatedAt: new Date(),
    })
    .where(eq(listingsTable.id, listing.id));

  // Look up the agent's personal site (if any) for the redirect target,
  // and notify them that their site has been archived.
  let agentWebsiteUrl: string | undefined;
  if (listing.agentId) {
    const agents = await db
      .select()
      .from(agentsTable)
      .where(eq(agentsTable.id, listing.agentId))
      .limit(1);
    const agent = agents[0];
    agentWebsiteUrl = agent?.personalWebsiteUrl ?? undefined;
    if (agent?.email) {
      try {
        await enqueueEmail({
          toEmail: agent.email,
          kind: "transactional",
          dedupeKey: `listing_archived:${listing.id}`,
          ...listingArchivedEmail({
            agentEmail: agent.email,
            agentFirstName: agent.firstName,
            address: listing.address,
            closeStatus,
          }),
        });
      } catch (err) {
        log.error({ err }, "Failed to enqueue listing-archived email");
      }

      // Final marketing summary — only meaningful for listings that
      // were actually live (we have analytics for them) and only sent
      // for the three terminal statuses we model.
      const isFinalReportable =
        closeStatus === "Sold" || closeStatus === "Withdrawn" || closeStatus === "Expired";
      if (isFinalReportable && listing.mode === "live") {
        try {
          const stats = await getFinalMarketingStats(
            listing.id,
            listing.createdAt,
            new Date(),
          );
          const sellerEmail = listing.sellerEmail?.trim() || null;
          const isAgentOnly = !sellerEmail;
          const rendered = renderFinalMarketingReport({
            toEmail: sellerEmail ?? agent.email,
            ccEmail: sellerEmail ? agent.email : null,
            recipientName: sellerEmail ? "there" : agent.firstName,
            isAgentOnly,
            address: listing.address,
            closeStatus,
            agentFirstName: agent.firstName,
            agentLastName: agent.lastName,
            agentEmail: agent.email,
            agentPhone: agent.phone ?? null,
            agentHeadshotUrl: agent.headshotUrl ?? null,
            brokerage: agent.brokerage ?? null,
            stats,
          });
          await enqueueEmail({
            toEmail: rendered.to,
            subject: rendered.subject,
            html: rendered.html,
            textBody: rendered.text,
            kind: "final_marketing_report",
            dedupeKey: `final_report:${listing.id}`,
            metadata: {
              listingId: listing.id,
              closeStatus,
              cc: rendered.cc,
            },
          });
          log.info(
            { listingId: listing.id, closeStatus, totalViews: stats.totalViews, totalLeads: stats.totalLeads },
            "Final marketing report enqueued",
          );
        } catch (err) {
          log.error({ err }, "Failed to enqueue final marketing report");
        }
      }
    }
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
