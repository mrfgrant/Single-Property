import {
  db,
  listingsTable,
  agentsTable,
  emailOutboxTable,
  emailSuppressionsTable,
} from "@workspace/db";
import { eq, inArray, sql } from "drizzle-orm";
import { mlsEventBus, type ListingUpsertedEvent } from "../mls/eventBus.js";
import { enqueueSms } from "../outbox/sms.js";
import { coldOutreachDigestEmail, coldOutreachSms } from "../email.js";
import { createListingTrackingUrls } from "../tracking.js";
import { pickAgentMobile } from "./phone.js";
import { buildUnsubscribeUrl } from "./unsubscribe.js";
import { nextSendWindow7to9amET } from "./sendWindow.js";
import { logger } from "../logger.js";

const log = logger.child({ component: "cold-outreach" });

const MARKETING_SITE_URL =
  process.env.MARKETING_SITE_URL ?? process.env.PLATFORM_HOMEPAGE_URL ?? "https://app.propsite.io";

/**
 * Convert a stored photo path to a full absolute URL suitable for use in
 * outgoing emails. Email clients (Gmail, Outlook, Apple Mail) require
 * absolute HTTPS URLs — they cannot load relative paths.
 *
 * - Already-absolute URLs (http/https) are returned unchanged.
 *   These are raw MLS CDN URLs used when our Object Storage upload failed.
 * - Relative `/objects/<uuid>` paths are served by the API at
 *   `GET /api/storage/objects/<uuid>` — we prepend the public base URL.
 * - Anything else is dropped (returns null) so we never embed a broken src.
 */
function resolvePhotoUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
  if (raw.startsWith("/objects/")) {
    const entityId = raw.slice("/objects/".length);
    const base = MARKETING_SITE_URL.replace(/\/+$/, "");
    return `${base}/api/storage/objects/${entityId}`;
  }
  return null;
}

/**
 * Per-agent batching window: while the agent's digest email is still
 * pending in the outbox (i.e. send_after has not yet been reached), any
 * additional `listing.upserted` events for that agent get APPENDED to
 * the same outbox row instead of creating a new one. The result: an
 * agent who lists 3 properties the same night receives one digest
 * email, not three separate ones.
 */
type ListingRow = typeof listingsTable.$inferSelect;

async function onListingUpserted(event: ListingUpsertedEvent): Promise<void> {
  if (!event.isNew) return;

  const rows = await db
    .select()
    .from(listingsTable)
    .where(eq(listingsTable.id, event.listingId))
    .limit(1);
  const listing = rows[0];
  if (!listing) return;
  if (listing.purgedAt) return;
  if (listing.agentId) {
    log.debug({ listingId: listing.id }, "Listing has owner agent — skipping cold outreach");
    return;
  }
  if (!listing.listAgentMlsId) {
    log.debug({ listingId: listing.id }, "Listing has no listAgentMlsId — skipping");
    return;
  }
  if (!listing.listAgentEmail) {
    log.debug({ listingId: listing.id }, "Listing has no listAgentEmail — skipping email outreach");
    // Still consider SMS path below if we have a mobile.
    await maybeSendColdSms(listing);
    return;
  }

  // If a customer with that MLS agent ID already exists, skip — they
  // already pay us; the listing will be backfilled to them.
  const existingCustomer = await db
    .select({ id: agentsTable.id })
    .from(agentsTable)
    .where(eq(agentsTable.mlsAgentId, listing.listAgentMlsId))
    .limit(1);
  if (existingCustomer[0]) {
    log.info(
      { listingId: listing.id, mlsAgentId: listing.listAgentMlsId },
      "MLS agent is already a PropSite customer — skipping cold outreach",
    );
    return;
  }

  const recipient = listing.listAgentEmail.toLowerCase();

  // Pre-check the suppression list. If they've previously unsubscribed,
  // we silently drop. The outbox drainer also enforces this; the early
  // skip avoids creating outbox noise.
  const sup = await db
    .select({ email: emailSuppressionsTable.email })
    .from(emailSuppressionsTable)
    .where(eq(emailSuppressionsTable.email, recipient))
    .limit(1);
  if (sup[0]) {
    log.info({ listingId: listing.id, email: recipient }, "Recipient previously unsubscribed — skipping cold outreach");
    return;
  }

  await upsertDigestForAgent(recipient, listing);

  // SMS channel runs as before (one per listing). Out of scope for the
  // digest batching work; explicitly preserved so existing per-listing
  // SMS behavior is unchanged.
  await maybeSendColdSms(listing);
}

/**
 * For the given recipient, either:
 *   (a) APPEND this listing to an existing pending digest row (if one
 *       exists and hasn't been sent yet), or
 *   (b) INSERT a new digest row scheduled for the next 7–9 AM ET window.
 *
 * Idempotent: re-emitting `listing.upserted` for a listing already in
 * the digest is a no-op.
 */
async function upsertDigestForAgent(recipient: string, listing: ListingRow): Promise<void> {
  const dedupeKey = `cold_outreach:agent:${recipient}`;

  const previewUrl = `${MARKETING_SITE_URL}/listing/${listing.id}`;
  const onboardingUrl = `${MARKETING_SITE_URL}/onboarding?listing=${listing.id}`;
  const photoUrl = resolvePhotoUrl(listing.photoUrls?.[0]);
  const firstName = firstNameOf(listing.listAgentName);
  const unsubscribeUrl = buildUnsubscribeUrl(MARKETING_SITE_URL, recipient);

  // Race-safe append. Two correctness layers:
  //   (1) A Postgres transaction-scoped advisory lock keyed by the
  //       recipient email serializes ALL concurrent handlers for the
  //       same agent — even when no pending row exists yet, which
  //       row-level FOR UPDATE alone cannot guard against (the row
  //       isn't there to lock until one of them inserts it).
  //   (2) FOR UPDATE on the pending dedupe row guards the read-modify-
  //       write of metadata.listingIds within the held lock.
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${dedupeKey}))`);

    const lockRows = await tx.execute<{ id: string; metadata: Record<string, unknown> | null }>(sql`
      SELECT id, metadata
        FROM ${emailOutboxTable}
       WHERE dedupe_key = ${dedupeKey}
         AND status = 'pending'
       LIMIT 1
       FOR UPDATE
    `);
    const lockedRows =
      (lockRows as unknown as { rows: Array<{ id: string; metadata: Record<string, unknown> | null }> })
        .rows ??
      (lockRows as unknown as Array<{ id: string; metadata: Record<string, unknown> | null }>);
    const existing = lockedRows[0];

    if (existing) {
      const meta = (existing.metadata ?? {}) as Record<string, unknown>;
      const ids = Array.isArray(meta.listingIds)
        ? (meta.listingIds.filter((x) => typeof x === "string") as string[])
        : [];
      if (ids.includes(listing.id)) {
        log.debug({ listingId: listing.id, recipient }, "Listing already in pending digest — no-op");
        return;
      }
      const newIds = [...ids, listing.id];

      // Re-render the email with the full set of listings now in the digest.
      const allListings = await tx
        .select()
        .from(listingsTable)
        .where(inArray(listingsTable.id, newIds));
      const eligibleListings = allListings.filter(
        (l) => !l.purgedAt && !l.agentId && l.mode === "preview" && l.status === "active",
      );
      const items = await Promise.all(
        eligibleListings.map(async (l) => {
          const { previewUrl, activateUrl } = await createListingTrackingUrls(
            {
              agentEmail: recipient,
              listingId: l.id,
              rawPreviewUrl: `${MARKETING_SITE_URL}/listing/${l.id}`,
              rawActivateUrl: `${MARKETING_SITE_URL}/onboarding?listing=${l.id}`,
            },
            tx,
          );
          return {
            address: l.address,
            previewUrl,
            activateUrl,
            photoUrl: resolvePhotoUrl(l.photoUrls?.[0]),
            beds: l.beds,
            baths: l.baths,
            sqft: l.sqft,
            price: l.priceUsd,
            yearBuilt: l.yearBuilt,
            lotAcres: l.lotAcres,
            garage: null,
            description: l.description,
          };
        }),
      );
      if (items.length === 0) {
        log.info({ recipient }, "No eligible listings remain in digest — leaving row untouched");
        return;
      }

      const rendered = coldOutreachDigestEmail({
        agentEmail: recipient,
        agentFirstName: firstName,
        listings: items,
        unsubscribeUrl,
      });

      await tx
        .update(emailOutboxTable)
        .set({
          subject: rendered.subject,
          html: rendered.html,
          textBody: rendered.text,
          metadata: { ...meta, listingIds: newIds, mlsAgentId: listing.listAgentMlsId },
          updatedAt: new Date(),
        })
        .where(eq(emailOutboxTable.id, existing.id));

      log.info(
        { outboxId: existing.id, recipient, listingCount: newIds.length },
        "Appended listing to pending cold-outreach digest",
      );
      return;
    }

    // No pending digest — create a fresh one inside the same transaction.
    const sendAfter = nextSendWindow7to9amET();
    const { previewUrl: trackedPreviewUrl, activateUrl: trackedActivateUrl } =
      await createListingTrackingUrls(
        {
          agentEmail: recipient,
          listingId: listing.id,
          rawPreviewUrl: previewUrl,
          rawActivateUrl: onboardingUrl,
        },
        tx,
      );
    const rendered = coldOutreachDigestEmail({
      agentEmail: recipient,
      agentFirstName: firstName,
      listings: [
        {
          address: listing.address,
          previewUrl: trackedPreviewUrl,
          activateUrl: trackedActivateUrl,
          photoUrl,
          beds: listing.beds,
          baths: listing.baths,
          sqft: listing.sqft,
          price: listing.priceUsd,
          yearBuilt: listing.yearBuilt,
          lotAcres: listing.lotAcres,
          garage: null,
          description: listing.description,
        },
      ],
      unsubscribeUrl,
    });
    const [inserted] = await tx
      .insert(emailOutboxTable)
      .values({
        toEmail: recipient,
        kind: "cold_outreach",
        subject: rendered.subject,
        html: rendered.html,
        textBody: rendered.text,
        dedupeKey,
        sendAfter,
        metadata: {
          listingIds: [listing.id],
          agentEmail: recipient,
          mlsAgentId: listing.listAgentMlsId,
        },
      })
      .returning({ id: emailOutboxTable.id });
    log.info(
      { outboxId: inserted?.id, recipient, listingId: listing.id, sendAfter },
      "Queued cold-outreach digest for next 7–9 AM ET window",
    );
  });
}

async function maybeSendColdSms(listing: ListingRow): Promise<void> {
  const phones = pickAgentMobile({
    mobilePhone: listing.listAgentMobilePhone,
    directPhone: listing.listAgentDirectPhone ?? listing.listAgentPhone,
    officePhone: listing.listAgentOfficePhone,
  });
  const phone = phones?.phone ?? null;
  if (!phone) return;
  const previewUrl = `${MARKETING_SITE_URL}/listing/${listing.id}`;
  const sendAfter = nextSendWindow7to9amET();
  const dedupeKey = `cold_outreach:${listing.id}:sms`;
  try {
    await enqueueSms({
      toPhone: phone,
      body: coldOutreachSms({
        agentFirstName: firstNameOf(listing.listAgentName),
        address: listing.address,
        previewUrl,
      }),
      kind: "cold_outreach",
      dedupeKey,
      sendAfter,
      metadata: { listingId: listing.id, mlsAgentId: listing.listAgentMlsId },
    });
  } catch (err) {
    log.error({ err, listingId: listing.id }, "Failed to enqueue cold outreach SMS");
  }
}

function firstNameOf(full: string | null | undefined): string {
  if (!full) return "there";
  return full.trim().split(/\s+/)[0] || "there";
}

/**
 * After `syncPhotos()` stores the first photo for a brand-new listing, call
 * this to patch the pending cold-outreach outbox entry for that agent so the
 * email hero block includes the real listing photo.
 *
 * Context: the initial email HTML is rendered inside `upsertDigestForAgent()`
 * which fires synchronously on the `listing.upserted` event — before the MLS
 * sync has had a chance to download photos. This function re-renders and
 * overwrites the stored HTML now that `listing.photo_urls` is populated.
 *
 * No-ops silently when:
 *  - The listing has no agent email
 *  - The listing still has no photos (MLS had none, or download failed)
 *  - No pending outbox entry exists (already sent, or never created)
 */
export async function refreshColdOutreachPhoto(listingId: string): Promise<void> {
  const rows = await db
    .select()
    .from(listingsTable)
    .where(eq(listingsTable.id, listingId))
    .limit(1);
  const listing = rows[0];
  if (!listing?.listAgentEmail) return;
  if (!listing.photoUrls?.length) return;

  const recipient = listing.listAgentEmail.toLowerCase();
  const dedupeKey = `cold_outreach:agent:${recipient}`;
  const firstName = firstNameOf(listing.listAgentName);
  const unsubscribeUrl = buildUnsubscribeUrl(MARKETING_SITE_URL, recipient);

  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${dedupeKey}))`);

    const lockRows = await tx.execute<{ id: string; metadata: Record<string, unknown> | null }>(sql`
      SELECT id, metadata
        FROM ${emailOutboxTable}
       WHERE dedupe_key = ${dedupeKey}
         AND status = 'pending'
       LIMIT 1
       FOR UPDATE
    `);
    const lockedRows =
      (lockRows as unknown as { rows: Array<{ id: string; metadata: Record<string, unknown> | null }> })
        .rows ??
      (lockRows as unknown as Array<{ id: string; metadata: Record<string, unknown> | null }>);
    const existing = lockedRows[0];

    if (!existing) {
      log.debug({ listingId, recipient }, "No pending digest to refresh photo for — skipping");
      return;
    }

    const meta = (existing.metadata ?? {}) as Record<string, unknown>;
    const ids = Array.isArray(meta.listingIds)
      ? (meta.listingIds.filter((x) => typeof x === "string") as string[])
      : [];

    const allListings = await tx
      .select()
      .from(listingsTable)
      .where(inArray(listingsTable.id, ids.length ? ids : [listingId]));
    const eligibleListings = allListings.filter(
      (l) => !l.purgedAt && !l.agentId && l.mode === "preview" && l.status === "active",
    );
    if (eligibleListings.length === 0) return;

    const items = await Promise.all(
      eligibleListings.map(async (l) => {
        const { previewUrl, activateUrl } = await createListingTrackingUrls(
          {
            agentEmail: recipient,
            listingId: l.id,
            rawPreviewUrl: `${MARKETING_SITE_URL}/listing/${l.id}`,
            rawActivateUrl: `${MARKETING_SITE_URL}/onboarding?listing=${l.id}`,
          },
          tx,
        );
        return {
          address: l.address,
          previewUrl,
          activateUrl,
          photoUrl: resolvePhotoUrl(l.photoUrls?.[0]),
          beds: l.beds,
          baths: l.baths,
          sqft: l.sqft,
          price: l.priceUsd,
          yearBuilt: l.yearBuilt,
          lotAcres: l.lotAcres,
          garage: null,
          description: l.description,
        };
      }),
    );

    const rendered = coldOutreachDigestEmail({
      agentEmail: recipient,
      agentFirstName: firstName,
      listings: items,
      unsubscribeUrl,
    });

    await tx
      .update(emailOutboxTable)
      .set({
        subject: rendered.subject,
        html: rendered.html,
        textBody: rendered.text,
        updatedAt: new Date(),
      })
      .where(eq(emailOutboxTable.id, existing.id));

    log.info(
      { outboxId: existing.id, recipient, listingId },
      "Patched cold-outreach digest with listing photo after sync",
    );
  });
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
