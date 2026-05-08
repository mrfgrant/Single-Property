import { Router } from "express";
import multer from "multer";
import { db } from "@workspace/db";
import { exampleListingsTable, insertExampleListingSchema, listingsTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";
import { adminAuth } from "../middleware/adminAuth.js";
import { ObjectStorageService } from "../lib/objectStorage.js";
import { mlsClient, type ResoProperty } from "../lib/mls/client.js";
import { getMlsConfig } from "../lib/mls/config.js";
import { logger } from "../lib/logger.js";

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Only JPEG, PNG and WebP images are allowed"));
  },
});

const objectStorage = new ObjectStorageService();

/* GET /admin/listings */
router.get("/admin/listings", adminAuth, async (_req, res) => {
  const rows = await db
    .select()
    .from(exampleListingsTable)
    .orderBy(desc(exampleListingsTable.featured), desc(exampleListingsTable.createdAt));
  res.json({ listings: rows });
});

/* POST /admin/listings */
router.post("/admin/listings", adminAuth, async (req, res) => {
  const parsed = insertExampleListingSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", issues: parsed.error.issues });
    return;
  }
  const [row] = await db.insert(exampleListingsTable).values(parsed.data).returning();
  res.status(201).json({ listing: row });
});

/* PATCH /admin/listings/:id */
router.patch("/admin/listings/:id", adminAuth, async (req, res) => {
  const parsed = insertExampleListingSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", issues: parsed.error.issues });
    return;
  }
  const [row] = await db
    .update(exampleListingsTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(exampleListingsTable.id, req.params.id))
    .returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ listing: row });
});

/* DELETE /admin/listings/:id — hard delete */
router.delete("/admin/listings/:id", adminAuth, async (req, res) => {
  const [row] = await db
    .delete(exampleListingsTable)
    .where(eq(exampleListingsTable.id, req.params.id))
    .returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ success: true });
});

/* POST /admin/listings/:id/photos — multipart upload */
router.post(
  "/admin/listings/:id/photos",
  adminAuth,
  upload.single("photo"),
  async (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: "No file uploaded" });
      return;
    }

    const [listing] = await db
      .select()
      .from(exampleListingsTable)
      .where(eq(exampleListingsTable.id, req.params.id));
    if (!listing) { res.status(404).json({ error: "Not found" }); return; }

    // Get a presigned PUT URL (generates a UUID-based object path internally)
    const presignedUrl = await objectStorage.getObjectEntityUploadURL();

    await fetch(presignedUrl, {
      method: "PUT",
      headers: { "Content-Type": req.file.mimetype },
      body: req.file.buffer,
    });

    // Normalize to a stable /objects/... path for serving via our API
    const objectPath = objectStorage.normalizeObjectEntityPath(presignedUrl);
    const currentPhotos = listing.photoUrls ?? [];
    const updatedPhotos = [...currentPhotos, objectPath];

    const [updated] = await db
      .update(exampleListingsTable)
      .set({ photoUrls: updatedPhotos, updatedAt: new Date() })
      .where(eq(exampleListingsTable.id, req.params.id))
      .returning();

    res.json({ listing: updated, photoUrl: objectPath });
  }
);

/* POST /admin/listings/:id/asset/:kind — upload agent photo or brokerage logo */
router.post(
  "/admin/listings/:id/asset/:kind",
  adminAuth,
  upload.single("file"),
  async (req, res) => {
    const kind = req.params.kind;
    if (kind !== "agent_photo" && kind !== "brokerage_logo") {
      res.status(400).json({ error: "Invalid asset kind" });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: "No file uploaded" });
      return;
    }

    const [listing] = await db
      .select()
      .from(exampleListingsTable)
      .where(eq(exampleListingsTable.id, req.params.id));
    if (!listing) { res.status(404).json({ error: "Not found" }); return; }

    const presignedUrl = await objectStorage.getObjectEntityUploadURL();
    await fetch(presignedUrl, {
      method: "PUT",
      headers: { "Content-Type": req.file.mimetype },
      body: req.file.buffer,
    });
    const objectPath = objectStorage.normalizeObjectEntityPath(presignedUrl);

    const updateField = kind === "agent_photo"
      ? { agentPhotoUrl: objectPath }
      : { brokerageLogoUrl: objectPath };

    const [updated] = await db
      .update(exampleListingsTable)
      .set({ ...updateField, updatedAt: new Date() })
      .where(eq(exampleListingsTable.id, req.params.id))
      .returning();

    res.json({ listing: updated, url: objectPath });
  }
);

/* DELETE /admin/listings/:id/asset/:kind */
router.delete("/admin/listings/:id/asset/:kind", adminAuth, async (req, res) => {
  const kind = req.params.kind;
  if (kind !== "agent_photo" && kind !== "brokerage_logo") {
    res.status(400).json({ error: "Invalid asset kind" });
    return;
  }
  const updateField = kind === "agent_photo"
    ? { agentPhotoUrl: null }
    : { brokerageLogoUrl: null };
  const [updated] = await db
    .update(exampleListingsTable)
    .set({ ...updateField, updatedAt: new Date() })
    .where(eq(exampleListingsTable.id, req.params.id))
    .returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ listing: updated });
});

/* DELETE /admin/listings/:id/photos/:index */
router.delete("/admin/listings/:id/photos/:index", adminAuth, async (req, res) => {
  const idx = parseInt(req.params.index, 10);
  const [listing] = await db
    .select()
    .from(exampleListingsTable)
    .where(eq(exampleListingsTable.id, req.params.id));
  if (!listing) { res.status(404).json({ error: "Not found" }); return; }

  const photos = [...(listing.photoUrls ?? [])];
  if (idx < 0 || idx >= photos.length) {
    res.status(400).json({ error: "Invalid photo index" });
    return;
  }
  photos.splice(idx, 1);

  const [updated] = await db
    .update(exampleListingsTable)
    .set({ photoUrls: photos, updatedAt: new Date() })
    .where(eq(exampleListingsTable.id, req.params.id))
    .returning();

  res.json({ listing: updated });
});

/**
 * Cache-then-live single-property MLS resolver. Shared by the GET lookup
 * route and the POST import-from-mls alias so both endpoints have one
 * source of truth for the resolution logic.
 *
 * Resolution order:
 *   1. Local cache (`listings.mls_listing_id`) — best-effort fast path.
 *      Note: sync stores RESO `ListingKey` (opaque hex) here while
 *      operators usually paste the human `ListingId`/MLS#. The cache
 *      hits when they happen to match (some boards do, or when the
 *      operator pastes a ListingKey directly); otherwise we fall
 *      through to the live query, which is authoritative.
 *   2. Live RESO query filtered by `ListingId` against the configured
 *      MLS feed (SourceRE or generic RESO).
 */
type LookupResult =
  | { available: true; source: "cache" | "live"; data: Record<string, unknown> }
  | { available: false; reason: string };

async function resolveMlsListing(rawMlsId: string): Promise<LookupResult> {
  const mlsId = rawMlsId.trim();
  if (!mlsId) return { available: false, reason: "Missing MLS id" };

  const [cached] = await db
    .select()
    .from(listingsTable)
    .where(eq(listingsTable.mlsListingId, mlsId))
    .limit(1);
  if (cached) {
    return {
      available: true,
      source: "cache",
      data: {
        mlsId: cached.mlsListingId ?? mlsId,
        address: cached.address,
        city: cached.city,
        state: cached.state,
        zip: cached.zip ?? "",
        priceUsd: cached.priceUsd ?? undefined,
        beds: cached.beds ?? undefined,
        baths: cached.baths ?? undefined,
        sqft: cached.sqft ?? undefined,
        lotAcres: cached.lotAcres ?? undefined,
        yearBuilt: cached.yearBuilt ?? undefined,
        description: cached.description ?? "",
        agentName: cached.listAgentName ?? "",
        agentEmail: cached.listAgentEmail ?? "",
        agentPhone: cached.listAgentPhone ?? "",
        agentBrokerage: cached.mlsBrokerageName ?? "",
        photoUrls: cached.photoUrls ?? [],
      },
    };
  }

  const cfg = getMlsConfig();
  if (!cfg.configured) {
    return { available: false, reason: "MLS integration not yet configured" };
  }

  const safe = mlsId.replace(/'/g, "''");
  let found: ResoProperty | null = null;
  for await (const page of mlsClient.iterateProperties({
    filter: `ListingId eq '${safe}'`,
    top: 1,
  })) {
    if (page.length > 0) {
      found = page[0];
      break;
    }
  }
  if (!found) {
    return { available: false, reason: `MLS #${mlsId} not found in feed` };
  }

  const p = found;
  const address =
    p.UnparsedAddress?.trim() ||
    [p.StreetNumber, p.StreetName, p.StreetSuffix]
      .filter(Boolean)
      .join(" ")
      .trim() ||
    "";
  return {
    available: true,
    source: "live",
    data: {
      mlsId,
      address,
      city: p.City ?? "",
      state: p.StateOrProvince ?? "GA",
      zip: p.PostalCode ?? "",
      priceUsd: p.ListPrice ?? undefined,
      beds: p.BedroomsTotal ?? undefined,
      baths: p.BathroomsTotalDecimal ?? p.BathroomsTotalInteger ?? undefined,
      sqft: p.LivingArea ?? undefined,
      lotAcres: p.LotSizeAcres ?? undefined,
      yearBuilt: p.YearBuilt ?? undefined,
      description: p.PublicRemarks ?? "",
      agentName: p.ListAgentFullName ?? "",
      agentEmail: p.ListAgentEmail ?? "",
      agentPhone: p.ListAgentPreferredPhone ?? "",
      agentBrokerage: p.ListOfficeName ?? "",
    },
  };
}

/* GET /admin/mls-lookup/:mlsId — pre-fill the admin "Add listing" form
 * from the MLS feed. Returns `{ available: false, reason }` when MLS
 * is unconfigured or the property can't be found so the admin form
 * degrades to manual entry without surfacing an error to the operator. */
router.get("/admin/mls-lookup/:mlsId", adminAuth, async (req, res) => {
  try {
    const result = await resolveMlsListing(String(req.params.mlsId || ""));
    res.json(result);
  } catch (err) {
    logger.warn({ err, mlsId: req.params.mlsId }, "MLS lookup failed");
    res.json({
      available: false,
      reason: err instanceof Error ? err.message : "MLS lookup failed unexpectedly",
    });
  }
});

/* POST /admin/listings/import-from-mls — symmetric alias for the GET
 * lookup, listed in the FG task spec. POSTing the MLS# in the body
 * avoids URL-encoding edge cases for non-canonical MLS# formats.
 * Returns the same `{ available, source, data }` shape; the admin form
 * previews the payload and the operator clicks Save to actually create
 * the row. */
router.post("/admin/listings/import-from-mls", adminAuth, async (req, res) => {
  const mlsNumber = String(req.body?.mlsNumber ?? req.body?.mlsId ?? "").trim();
  if (!mlsNumber) {
    res.status(400).json({ available: false, reason: "mlsNumber is required" });
    return;
  }
  try {
    const result = await resolveMlsListing(mlsNumber);
    res.json(result);
  } catch (err) {
    logger.warn({ err, mlsNumber }, "MLS import lookup failed");
    res.json({
      available: false,
      reason: err instanceof Error ? err.message : "MLS lookup failed unexpectedly",
    });
  }
});

export default router;
