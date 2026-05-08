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

/* GET /admin/mls-lookup/:mlsId
 *
 * Single-property MLS lookup. Returns a partial ListingInput populated
 * from MLS data so the admin "Add new listing" form can pre-fill from
 * an MLS#.
 *
 * Resolution order:
 *   1. Local cache: if the cron has already ingested this listing into
 *      `listings.mls_listing_id`, return it immediately (no network).
 *   2. Live RESO query against the configured MLS feed (SourceRE or
 *      generic RESO) — fetches the single property by ListingId.
 *
 * Returns `{ available: false, reason }` when MLS is unconfigured or
 * the property cannot be found, so the admin form degrades to manual
 * entry without surfacing an error to the operator.
 */
router.get("/admin/mls-lookup/:mlsId", adminAuth, async (req, res) => {
  const mlsId = String(req.params.mlsId || "").trim();
  if (!mlsId) {
    res.json({ available: false, reason: "Missing MLS id" });
    return;
  }

  try {
    // 1. Local cache hit — best-effort. The sync stores RESO `ListingKey`
    //    (an opaque hex) in `listings.mls_listing_id`, but the operator
    //    typically pastes the human-readable `ListingId` (MLS#). We try
    //    the cache anyway so power users who paste a ListingKey, or
    //    listings re-claimed via MLS#==Key boards, still get a no-network
    //    fast path. Anything else falls through to the live RESO query
    //    below, which is filtered by `ListingId` and is authoritative.
    const [cached] = await db
      .select()
      .from(listingsTable)
      .where(eq(listingsTable.mlsListingId, mlsId))
      .limit(1);
    if (cached) {
      res.json({
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
          photoUrls: cached.photoUrls ?? [],
        },
      });
      return;
    }

    // 2. Live MLS query — only attempt when configured.
    const cfg = getMlsConfig();
    if (!cfg.configured) {
      res.json({
        available: false,
        reason: "MLS integration not yet configured",
      });
      return;
    }

    // SourceRE quirk: ListingId is the human MLS#, ListingKey is a
    // stable hex. The admin operator types in the MLS#, so filter on
    // ListingId. Both shapes work for generic RESO too.
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
      res.json({
        available: false,
        reason: `MLS #${mlsId} not found in feed`,
      });
      return;
    }

    const p = found;
    const address =
      p.UnparsedAddress?.trim() ||
      [p.StreetNumber, p.StreetName, p.StreetSuffix]
        .filter(Boolean)
        .join(" ")
        .trim() ||
      "";

    res.json({
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
        baths:
          p.BathroomsTotalDecimal ?? p.BathroomsTotalInteger ?? undefined,
        sqft: p.LivingArea ?? undefined,
        lotAcres: p.LotSizeAcres ?? undefined,
        yearBuilt: p.YearBuilt ?? undefined,
        description: p.PublicRemarks ?? "",
        agentName: p.ListAgentFullName ?? "",
        agentEmail: p.ListAgentEmail ?? "",
        agentPhone: p.ListAgentPreferredPhone ?? "",
      },
    });
  } catch (err) {
    logger.warn({ err, mlsId }, "MLS lookup failed");
    res.json({
      available: false,
      reason:
        err instanceof Error ? err.message : "MLS lookup failed unexpectedly",
    });
  }
});

export default router;
