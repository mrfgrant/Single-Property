import { Router } from "express";
import { db } from "@workspace/db";
import { exampleListingsTable, standaloneDomainsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { adminAuth } from "../middleware/adminAuth.js";
import {
  isDomainAvailable,
  generateCandidates,
  pickAvailableDomain,
} from "../lib/cloudflare/domainGenerator.js";
import { registerDomain, listRegisteredDomains } from "../lib/cloudflare/registrar.js";
import {
  ensureZone,
  getZone,
  listDnsRecords,
  upsertDnsRecord,
  deleteDnsRecord,
} from "../lib/cloudflare/dns.js";

const router = Router();

/* POST /api/admin/domain/search
   Body: { domain?: string; address?: string; city?: string }
   Returns: { results: Array<{ domain, available }> }
*/
router.post("/admin/domain/search", adminAuth, async (req, res) => {
  const { domain, address, city } = req.body as {
    domain?: string;
    address?: string;
    city?: string;
  };

  if (!domain && !(address && city)) {
    res.status(400).json({ error: "Provide either domain or address+city" });
    return;
  }

  if (domain) {
    const available = await isDomainAvailable(domain.toLowerCase().trim());
    res.json({ results: [{ domain: domain.toLowerCase().trim(), available }] });
    return;
  }

  const candidates = generateCandidates(address!, city!);
  const results = await Promise.all(
    candidates.map(async (d) => ({ domain: d, available: await isDomainAvailable(d) })),
  );
  res.json({ results });
});

/* POST /api/admin/domain/register
   Body: { domain: string; notes?: string }
   Registers the domain and ensures a Cloudflare zone exists.
*/
router.post("/admin/domain/register", adminAuth, async (req, res) => {
  const { domain, notes } = req.body as { domain?: string; notes?: string };
  if (!domain) {
    res.status(400).json({ error: "domain is required" });
    return;
  }

  const domainClean = domain.toLowerCase().trim();

  const registered = await registerDomain(domainClean);

  let zone = null;
  let zoneWarning: string | null = null;
  try {
    zone = await ensureZone(domainClean);
  } catch (zoneErr: unknown) {
    zoneWarning = (zoneErr instanceof Error ? zoneErr.message : String(zoneErr));
  }

  const existing = await db
    .select()
    .from(standaloneDomainsTable)
    .where(eq(standaloneDomainsTable.domain, domainClean))
    .limit(1);

  let row = existing[0];
  if (!row) {
    const inserted = await db
      .insert(standaloneDomainsTable)
      .values({ domain: domainClean, cloudflareZoneId: zone?.id ?? null, notes: notes ?? null })
      .returning();
    row = inserted[0];
  } else {
    const updated = await db
      .update(standaloneDomainsTable)
      .set({ cloudflareZoneId: zone?.id ?? row.cloudflareZoneId, notes: notes ?? row.notes })
      .where(eq(standaloneDomainsTable.domain, domainClean))
      .returning();
    row = updated[0];
  }

  res.json({ domain: row, registration: registered, zone, warning: zoneWarning });
});

/* POST /api/admin/domain/assign
   Body: { domain: string; listingId: string }
   Registers domain (if needed), ensures zone, writes domain_name onto the listing.
*/
router.post("/admin/domain/assign", adminAuth, async (req, res) => {
  const { domain, listingId } = req.body as { domain?: string; listingId?: string };
  if (!domain || !listingId) {
    res.status(400).json({ error: "domain and listingId are required" });
    return;
  }

  const domainClean = domain.toLowerCase().trim();

  const [listing] = await db
    .select()
    .from(exampleListingsTable)
    .where(eq(exampleListingsTable.id, listingId))
    .limit(1);
  if (!listing) {
    res.status(404).json({ error: "Listing not found" });
    return;
  }

  const registered = await registerDomain(domainClean);

  let zone = null;
  let zoneWarning: string | null = null;
  try {
    zone = await ensureZone(domainClean);
  } catch (zoneErr: unknown) {
    zoneWarning = (zoneErr instanceof Error ? zoneErr.message : String(zoneErr));
  }

  const [updated] = await db
    .update(exampleListingsTable)
    .set({ domainName: domainClean, updatedAt: new Date() })
    .where(eq(exampleListingsTable.id, listingId))
    .returning();

  res.json({ listing: updated, registration: registered, zone, warning: zoneWarning });
});

/* POST /api/admin/domain/unassign
   Body: { listingId: string }
   Clears domain_name from a listing.
*/
router.post("/admin/domain/unassign", adminAuth, async (req, res) => {
  const { listingId } = req.body as { listingId?: string };
  if (!listingId) {
    res.status(400).json({ error: "listingId is required" });
    return;
  }

  const [updated] = await db
    .update(exampleListingsTable)
    .set({ domainName: null, updatedAt: new Date() })
    .where(eq(exampleListingsTable.id, listingId))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Listing not found" });
    return;
  }

  res.json({ listing: updated });
});

/* GET /api/admin/domain/list
   Returns all known domains: standalone table + listing assignments + Cloudflare registrar.
*/
router.get("/admin/domain/list", adminAuth, async (_req, res) => {
  const [cfDomains, standalones, listings] = await Promise.all([
    listRegisteredDomains(),
    db.select().from(standaloneDomainsTable),
    db
      .select({
        id: exampleListingsTable.id,
        slug: exampleListingsTable.slug,
        address: exampleListingsTable.address,
        city: exampleListingsTable.city,
        domainName: exampleListingsTable.domainName,
      })
      .from(exampleListingsTable)
      .where(eq(exampleListingsTable.status, "active")),
  ]);

  const listingsByDomain = Object.fromEntries(
    listings.filter((l) => l.domainName).map((l) => [l.domainName!, l]),
  );
  const standalonesByDomain = Object.fromEntries(standalones.map((s) => [s.domain, s]));

  const allDomainNames = Array.from(
    new Set([
      ...cfDomains.map((d) => d.name),
      ...standalones.map((s) => s.domain),
      ...listings.filter((l) => l.domainName).map((l) => l.domainName!),
    ]),
  );

  const result = allDomainNames.map((name) => {
    const cf = cfDomains.find((d) => d.name === name);
    const sa = standalonesByDomain[name];
    const lst = listingsByDomain[name];
    return {
      domain: name,
      registeredAt: cf?.expires_at ?? sa?.registeredAt ?? null,
      expiresAt: cf?.expires_at ?? null,
      autoRenew: cf?.auto_renew ?? null,
      zoneId: sa?.cloudflareZoneId ?? null,
      notes: sa?.notes ?? null,
      assignedTo: lst
        ? { listingId: lst.id, slug: lst.slug, address: lst.address, city: lst.city }
        : null,
      source: cf ? "cloudflare" : "local",
    };
  });

  res.json({ domains: result });
});

/* GET /api/admin/domain/dns/:domain
   Lists DNS records for the Cloudflare zone of the given domain.
*/
router.get("/admin/domain/dns/:domain", adminAuth, async (req, res) => {
  const zone = await getZone(String(req.params.domain));
  if (!zone) {
    res.status(404).json({ error: "No Cloudflare zone found for this domain. Register it first." });
    return;
  }
  const records = await listDnsRecords(zone.id);
  res.json({ zoneId: zone.id, records });
});

/* POST /api/admin/domain/dns/:domain
   Body: { type: "A" | "TXT"; name: string; content: string; ttl?: number; proxied?: boolean }
   Upserts a DNS record. CNAME type is blocked here (managed by provisioning flow).
*/
router.post("/admin/domain/dns/:domain", adminAuth, async (req, res) => {
  const { type, name, content, ttl, proxied } = req.body as {
    type?: string;
    name?: string;
    content?: string;
    ttl?: number;
    proxied?: boolean;
  };

  if (!type || !name || !content) {
    res.status(400).json({ error: "type, name, and content are required" });
    return;
  }
  if (!["A", "TXT"].includes(type.toUpperCase())) {
    res.status(400).json({ error: "Only A and TXT records can be managed here" });
    return;
  }

  const zone = await ensureZone(String(req.params.domain));
  const record = await upsertDnsRecord(zone.id, {
    type: type.toUpperCase(),
    name,
    content,
    proxied: proxied ?? false,
    ttl: ttl ?? (type.toUpperCase() === "TXT" ? 300 : 1),
  });
  res.json({ record });
});

/* DELETE /api/admin/domain/dns/:domain/:recordId
   Deletes a specific DNS record by its Cloudflare record ID.
*/
router.delete("/admin/domain/dns/:domain/:recordId", adminAuth, async (req, res) => {
  const zone = await getZone(String(req.params.domain));
  if (!zone) {
    res.status(404).json({ error: "No Cloudflare zone found for this domain" });
    return;
  }

  const records = await listDnsRecords(zone.id);
  const target = records.find((r) => r.id === req.params.recordId);
  if (!target) {
    res.status(404).json({ error: "DNS record not found" });
    return;
  }
  if (target.type === "CNAME") {
    res.status(403).json({ error: "CNAME records are managed by the provisioning flow and cannot be deleted here" });
    return;
  }

  await deleteDnsRecord(zone.id, String(req.params.recordId));
  res.json({ success: true });
});

export default router;
