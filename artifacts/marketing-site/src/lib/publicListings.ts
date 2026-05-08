import type { SampleListing } from "@/data/sampleListings";

interface ApiListing {
  id: string;
  mlsId?: string | null;
  slug: string;
  address: string;
  city: string;
  state: string;
  zip?: string | null;
  priceUsd?: number | null;
  beds?: number | null;
  baths?: number | null;
  sqft?: number | null;
  lotAcres?: number | null;
  yearBuilt?: number | null;
  garage?: boolean | null;
  description?: string | null;
  agentName?: string | null;
  agentPhone?: string | null;
  agentEmail?: string | null;
  agentPhotoUrl?: string | null;
  agentBrokerage?: string | null;
  brokerageLogoUrl?: string | null;
  photoUrls?: string[] | null;
  walkScore?: number | null;
  bikeScore?: number | null;
  schoolRating?: number | null;
  transitScore?: number | null;
  domainName?: string | null;
  status: string;
  featured: boolean;
  createdAt: string;
  /** Real listings.mode — `"preview" | "live" | "disabled"`. Absent on example rows. */
  mode?: string | null;
  /** ISO timestamp — when the api-server last refreshed this row from the MLS feed. Drives the IDX "Last updated" line. */
  mlsLastSyncedAt?: string | null;
}

export interface PublicListing extends SampleListing {
  /** Real listings.id UUID — present for live/preview rows, absent for purely sample data. */
  id?: string;
  isLive: boolean;
  photoUrls?: string[];
  agentPhone?: string;
  agentEmail?: string;
  agentPhotoUrl?: string;
  brokerageLogoUrl?: string;
  domainName?: string;
  /** Real listings.mode. Used by the activation banner to switch between claim/activate CTAs. */
  mode?: "preview" | "live" | "disabled";
  /** MLS listing number when sourced from the MLS — drives the IDX disclaimer. */
  mlsId?: string;
  /** ISO timestamp of our last MLS refresh — rendered as "Last updated …" near the IDX disclaimer. */
  mlsLastSyncedAt?: string;
}

const API_BASE = import.meta.env.VITE_API_URL ?? "";

/**
 * The DB stores object-storage paths as "/objects/uploads/<id>".
 * The actual HTTP route that serves them is "/api/storage/objects/uploads/<id>".
 * Translate stored paths to fetchable URLs (leave http(s):// URLs untouched).
 */
function resolvePhotoUrl(stored: string): string {
  if (/^https?:\/\//i.test(stored)) return stored;
  if (stored.startsWith("/objects/")) {
    return `${API_BASE}/api/storage${stored}`;
  }
  return stored;
}

export function apiToPublicListing(row: ApiListing): PublicListing {
  return {
    id: row.id,
    slug: row.slug,
    address: row.address,
    city: row.city,
    state: row.state,
    zip: row.zip ?? "",
    price: row.priceUsd ?? 0,
    beds: row.beds ?? 0,
    baths: typeof row.baths === "number" ? row.baths : 0,
    sqft: row.sqft ?? 0,
    lotAcres: row.lotAcres ?? 0,
    yearBuilt: row.yearBuilt ?? new Date().getFullYear(),
    garage: row.garage ?? false,
    walkScore: row.walkScore ?? 0,
    bikeScore: row.bikeScore ?? 0,
    schoolRating: row.schoolRating ?? 0,
    transitScore: row.transitScore ?? 0,
    description: row.description ?? "",
    agentName: row.agentName ?? "",
    agentBrokerage: row.agentBrokerage ?? "",
    listedDate: row.createdAt,
    featured: row.featured,
    isLive: true,
    photoUrls: row.photoUrls?.map(resolvePhotoUrl) ?? undefined,
    agentPhone: row.agentPhone ?? undefined,
    agentEmail: row.agentEmail ?? undefined,
    agentPhotoUrl: row.agentPhotoUrl ? resolvePhotoUrl(row.agentPhotoUrl) : undefined,
    brokerageLogoUrl: row.brokerageLogoUrl ? resolvePhotoUrl(row.brokerageLogoUrl) : undefined,
    domainName: row.domainName ?? undefined,
    mode:
      row.mode === "preview" || row.mode === "live" || row.mode === "disabled"
        ? row.mode
        : undefined,
    mlsId: row.mlsId ?? undefined,
    mlsLastSyncedAt: row.mlsLastSyncedAt ?? undefined,
  };
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function fetchPublicListings(): Promise<PublicListing[]> {
  try {
    const res = await fetch(`${API_BASE}/api/listings/examples`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const data: { listings: ApiListing[] } = await res.json();
    return data.listings.map(apiToPublicListing);
  } catch {
    return [];
  }
}

export async function fetchFeaturedListing(): Promise<PublicListing | null> {
  try {
    const res = await fetch(`${API_BASE}/api/listings/featured`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data: { listing: ApiListing } = await res.json();
    return apiToPublicListing(data.listing);
  } catch {
    return null;
  }
}

export async function fetchPublicListingBySlug(
  slug: string,
): Promise<PublicListing | null> {
  // If the URL segment looks like a UUID, prefer the real-listings preview
  // route (auto-built MLS sites that aren't yet activated). Falls back to
  // the example-listings route on 404 so demo slugs keep working.
  if (UUID_RE.test(slug)) {
    try {
      const res = await fetch(`${API_BASE}/api/listings/preview/${encodeURIComponent(slug)}`, {
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        const data: { listing: ApiListing } = await res.json();
        return apiToPublicListing(data.listing);
      }
    } catch {
      // fall through to example-route lookup
    }
  }
  try {
    const res = await fetch(`${API_BASE}/api/listings/examples/${encodeURIComponent(slug)}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data: { listing: ApiListing } = await res.json();
    return apiToPublicListing(data.listing);
  } catch {
    return null;
  }
}
