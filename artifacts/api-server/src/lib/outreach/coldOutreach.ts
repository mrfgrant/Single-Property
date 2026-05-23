import {
  db,
  listingsTable,
  agentsTable,
  emailOutboxTable,
  emailSuppressionsTable,
} from "@workspace/db";
import { eq, inArray, sql } from "drizzle-orm";
import { mlsEventBus, type ListingUpsertedEvent } from "../mls/eventBus.js";
import { coldOutreachDigestEmail } from "../email.js";
import { createListingTrackingUrls } from "../tracking.js";
import { buildUnsubscribeUrl } from "./unsubscribe.js";
import { nextSendWindow7to9amET } from "./sendWindow.js";
import { logger } from "../logger.js";

const log = logger.child({ component: "cold-outreach" });

/** Listings older than this will never receive a cold-outreach email. */
const LISTING_MAX_AGE_DAYS = 15;
const LISTING_MAX_AGE_MS = LISTING_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;

/**
 * Return the MLS on-market date for age-gating purposes.
 * Returns null when the date is absent — callers must treat null as
 * "ineligible" and skip cold outreach rather than falling back to
 * createdAt (ingest timestamp), which is not a reliable market date.
 */
function listingOnMarketDate(listing: {
  mlsListDate?: string | null;
  createdAt: Date | string;
}): { date: Date; verified: boolean } {
  if (listing.mlsListDate) return { date: new Date(listing.mlsListDate), verified: true };
  return { date: new Date(listing.createdAt), verified: false };
}

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

/** Extract the embed URL from the first virtual tour or video on a listing, if any. */
function resolveTourEmbedUrl(listing: ListingRow): { embedUrl: string; kind: "tour" | "video" } | null {
  const tours = listing.virtualTourUrls as Array<{ url: string; provider: string; embedUrl: string; kind: "tour" | "video" }> | null;
  if (!Array.isArray(tours) || tours.length === 0) return null;
  const entry = tours[0];
  if (!entry?.embedUrl) return null;
  return { embedUrl: entry.embedUrl, kind: entry.kind };
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
  // Route through the standard eligibility gate. At ingest time the listing
  // has no photos yet, so the media gate inside queueColdOutreachIfEligible
  // will no-op. When photos land later (syncPhotos → queueColdOutreachIfEligible),
  // outreach fires then. This call is future-safe: once virtual tours are
  // available (task #66), the gate gains one line and no other code changes.
  await queueColdOutreachIfEligible(event.listingId);
}

/**
 * Run all cold-outreach eligibility checks for a listing and queue the
 * outreach email if the listing qualifies. Called from sync.ts after
 * syncPhotos() confirms photos were newly stored, and from the hourly
 * photo backfill cron.
 *
 * This is the single trigger point for cold outreach — outreach is
 * NEVER queued at ingest time; only after confirmed media exists.
 *
 * @param calledAfterPhotoSync - Pass true when this is called immediately
 *   after syncPhotos() returned true. If the listing still has no photos
 *   at that point (race condition or all downloads failed), a structured
 *   warning is emitted so the issue can be investigated before the email
 *   window closes.
 */
export async function queueColdOutreachIfEligible(
  listingId: string,
  { calledAfterPhotoSync = false }: { calledAfterPhotoSync?: boolean } = {},
): Promise<void> {
  const rows = await db
    .select()
    .from(listingsTable)
    .where(eq(listingsTable.id, listingId))
    .limit(1);
  const listing = rows[0];
  if (!listing) return;
  if (listing.purgedAt) return;
  if (listing.agentId) {
    log.debug({ listingId: listing.id }, "Listing has owner agent — skipping cold outreach");
    return;
  }
  // Only preview-mode listings that are still active on the market are
  // eligible for cold outreach. Activated (paid) listings and off-market
  // listings must not receive outreach.
  if (listing.mode !== "preview" || listing.status !== "active") {
    log.debug(
      { listingId: listing.id, mode: listing.mode, status: listing.status },
      "Listing not in preview/active state — skipping cold outreach",
    );
    return;
  }
  if (!listing.listAgentMlsId) {
    log.debug({ listingId: listing.id }, "Listing has no listAgentMlsId — skipping");
    return;
  }
  if (!listing.listAgentEmail) {
    log.debug({ listingId: listing.id }, "Listing has no listAgentEmail — skipping email outreach");
    return;
  }

  // Media gate: require at least one photo OR at least one virtual tour/video.
  // Listings with only PDFs in the MLS remain ineligible; listings with a
  // Matterport/iGUIDE/YouTube/Vimeo embed qualify even without any photos.
  const hasPhotos = (listing.photoUrls?.length ?? 0) > 0;
  const hasTourOrVideo = Array.isArray((listing as any).virtualTourUrls) &&
    (listing as any).virtualTourUrls.length > 0;

  if (!hasPhotos && !hasTourOrVideo) {
    if (calledAfterPhotoSync) {
      log.warn(
        {
          listingId: listing.id,
          agentEmail: listing.listAgentEmail ?? null,
          agentMlsId: listing.listAgentMlsId ?? null,
          address: listing.address,
          mlsListingId: listing.mlsListingId ?? null,
        },
        "cold_outreach_no_photo_after_sync: listing still has no photos or virtual tour after syncPhotos() — outreach email will not be sent",
      );
    } else {
      log.debug(
        { listingId: listing.id },
        "Listing has no photos or virtual tour — skipping cold outreach (will retry when media arrives)",
      );
    }
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

  // Recency gate: listings with a verified mlsListDate must be within 15 days;
  // listings without one fall back to createdAt (ingest timestamp) with a
  // tighter 7-day window so recently-synced listings still get reached.
  const FALLBACK_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
  const { date: onMarketDate, verified } = listingOnMarketDate(listing);
  const maxAgeMs = verified ? LISTING_MAX_AGE_MS : FALLBACK_MAX_AGE_MS;
  const ageMs = Date.now() - onMarketDate.getTime();
  if (ageMs > maxAgeMs) {
    log.info(
      { listingId: listing.id, onMarketDate, ageDays: Math.floor(ageMs / 86_400_000), verified },
      "Listing outside recency window — skipping cold outreach",
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
  const tourEmbed = resolveTourEmbedUrl(listing);
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
          const lTourEmbed = resolveTourEmbedUrl(l);
          return {
            address: l.address,
            previewUrl,
            activateUrl,
            photoUrl: resolvePhotoUrl(l.photoUrls?.[0]),
            tourEmbedUrl: lTourEmbed?.embedUrl ?? null,
            tourKind: lTourEmbed?.kind ?? null,
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
          tourEmbedUrl: tourEmbed?.embedUrl ?? null,
          tourKind: tourEmbed?.kind ?? null,
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
