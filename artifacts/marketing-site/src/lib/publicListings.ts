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
}

export interface PublicListing extends SampleListing {
  isLive: boolean;
  photoUrls?: string[];
  agentPhone?: string;
  agentEmail?: string;
  agentPhotoUrl?: string;
  brokerageLogoUrl?: string;
  domainName?: string;
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
  };
}

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

export async function fetchPublicListingBySlug(
  slug: string,
): Promise<PublicListing | null> {
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
