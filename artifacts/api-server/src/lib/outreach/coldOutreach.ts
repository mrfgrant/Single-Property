import { db, listingsTable, agentsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { mlsEventBus, type ListingUpsertedEvent } from "../mls/eventBus.js";
import { enqueueEmail } from "../outbox/email.js";
import { enqueueSms } from "../outbox/sms.js";
import { coldOutreachEmail, coldOutreachSms } from "../email.js";
import { pickAgentMobile, normalize } from "./phone.js";
import { buildUnsubscribeUrl } from "./unsubscribe.js";
import { logger } from "../logger.js";

const log = logger.child({ component: "cold-outreach" });

const MARKETING_SITE_URL =
  process.env.MARKETING_SITE_URL ?? process.env.PLATFORM_HOMEPAGE_URL ?? "https://propsite.app";

const OUTREACH_DELAY_MS = Number(process.env.COLD_OUTREACH_DELAY_MS ?? 15 * 60 * 1000);

async function onListingUpserted(event: ListingUpsertedEvent): Promise<void> {
  if (!event.isNew) return;

  const rows = await db
    .select()
    .from(listingsTable)
    .where(eq(listingsTable.id, event.listingId))
    .limit(1);
  const listing = rows[0];
  if (!listing) return;

  // Skip if listing is already linked to an agent customer (i.e. they
  // already onboarded and we'll send the welcome/preview-ready email
  // through the regular transactional path).
  if (listing.agentId) {
    log.debug({ listingId: listing.id }, "Listing has owner agent — skipping cold outreach");
    return;
  }

  // We need either an MLS agent ID or an email/phone on the listing record
  // to know who to reach out to.
  if (!listing.listAgentMlsId) {
    log.debug({ listingId: listing.id }, "Listing has no listAgentMlsId — skipping cold outreach");
    return;
  }

  // If a customer with that MLS agent ID exists, this listing should
  // backfill onto them later — skip cold outreach.
  const existingCustomer = await db
    .select({ id: agentsTable.id })
    .from(agentsTable)
    .where(eq(agentsTable.mlsAgentId, listing.listAgentMlsId))
    .limit(1);
  if (existingCustomer[0]) {
    log.info(
      { listingId: listing.id, mlsAgentId: listing.listAgentMlsId },
      "Listing's MLS agent is already a PropSite customer — skipping cold outreach",
    );
    return;
  }

  const previewUrl = `${MARKETING_SITE_URL}/listing/${listing.id}`;
  const onboardingUrl = `${MARKETING_SITE_URL}/onboarding?listing=${listing.id}`;
  const sendAfter = new Date(Date.now() + OUTREACH_DELAY_MS);
  const dedupeBase = `cold_outreach:${listing.id}`;

  // EMAIL channel
  if (listing.listAgentEmail) {
    try {
      await enqueueEmail({
        toEmail: listing.listAgentEmail,
        kind: "cold_outreach",
        dedupeKey: `${dedupeBase}:email`,
        sendAfter,
        metadata: { listingId: listing.id, mlsAgentId: listing.listAgentMlsId },
        ...coldOutreachEmail({
          agentEmail: listing.listAgentEmail,
          agentFirstName: firstNameOf(listing.listAgentName),
          address: listing.address,
          previewUrl,
          activateUrl: onboardingUrl,
          unsubscribeUrl: buildUnsubscribeUrl(MARKETING_SITE_URL, listing.listAgentEmail),
        }),
      });
    } catch (err) {
      log.error({ err, listingId: listing.id }, "Failed to enqueue cold outreach email");
    }
  }

  // SMS channel — pick best mobile-confidence number.
  const phones = pickAgentMobile({
    mobilePhone: null, // populated by MLS sync if MLS feed exposes it; for now we only have one phone field on listings
    directPhone: listing.listAgentPhone,
    officePhone: null,
  });
  const phone = phones?.phone ?? normalize(listing.listAgentPhone);
  if (phone) {
    const sms = coldOutreachSms({
      agentFirstName: firstNameOf(listing.listAgentName),
      address: listing.address,
      previewUrl,
    });
    try {
      await enqueueSms({
        toPhone: phone,
        body: sms,
        kind: "cold_outreach",
        dedupeKey: `${dedupeBase}:sms`,
        sendAfter,
        metadata: { listingId: listing.id, mlsAgentId: listing.listAgentMlsId },
      });
    } catch (err) {
      log.error({ err, listingId: listing.id }, "Failed to enqueue cold outreach SMS");
    }
  } else {
    log.info({ listingId: listing.id }, "No eligible mobile number on listing — email-only outreach");
  }
}

function firstNameOf(full: string | null | undefined): string {
  if (!full) return "there";
  return full.trim().split(/\s+/)[0] || "there";
}

let initialized = false;
export function initColdOutreachBridge(): void {
  if (initialized) return;
  initialized = true;
  mlsEventBus.on("listing.upserted", (event) => {
    onListingUpserted(event).catch((err) =>
      log.error({ err, event }, "Cold outreach bridge threw"),
    );
  });
  log.info("Cold outreach bridge initialized — listening for listing.upserted (isNew)");
}
