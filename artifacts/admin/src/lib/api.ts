import { getToken } from "./auth";

const API_BASE = import.meta.env.VITE_API_URL ?? "";

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });
  if (res.status === 401) {
    throw new Error("UNAUTHORIZED");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }
  return res.json();
}

export interface ExampleListing {
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
  updatedAt: string;
}

export type ListingInput = Omit<ExampleListing, "id" | "createdAt" | "updatedAt">;

export interface DomainSearchResult {
  domain: string;
  available: boolean;
}

export interface DomainEntry {
  domain: string;
  registeredAt: string | null;
  expiresAt: string | null;
  autoRenew: boolean | null;
  zoneId: string | null;
  notes: string | null;
  assignedTo: { listingId: string; slug: string; address: string; city: string } | null;
  source: "cloudflare" | "local";
}

export interface DnsRecord {
  id: string;
  type: string;
  name: string;
  content: string;
  proxied: boolean;
  ttl: number;
}

export const api = {
  listings: {
    list: () => request<{ listings: ExampleListing[] }>("/api/admin/listings"),
    create: (data: Partial<ListingInput>) =>
      request<{ listing: ExampleListing }>("/api/admin/listings", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    update: (id: string, data: Partial<ListingInput>) =>
      request<{ listing: ExampleListing }>(`/api/admin/listings/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    remove: (id: string) =>
      request<{ success: boolean }>(`/api/admin/listings/${id}`, { method: "DELETE" }),
    uploadPhoto: async (id: string, file: File): Promise<{ listing: ExampleListing; photoUrl: string }> => {
      const token = getToken();
      const form = new FormData();
      form.append("photo", file);
      const res = await fetch(`${API_BASE}/api/admin/listings/${id}/photos`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      });
      if (res.status === 401) throw new Error("UNAUTHORIZED");
      if (!res.ok) throw new Error("Upload failed");
      return res.json();
    },
    deletePhoto: (id: string, index: number) =>
      request<{ listing: ExampleListing }>(`/api/admin/listings/${id}/photos/${index}`, {
        method: "DELETE",
      }),
    syncPhotos: (id: string) =>
      request<{ photoCount: number; photoUrls: string[]; skipped: boolean }>(
        `/api/admin/listings/${id}/sync-photos`,
        { method: "POST" },
      ),
    uploadAsset: async (
      id: string,
      kind: "agent_photo" | "brokerage_logo",
      file: File,
    ): Promise<{ listing: ExampleListing; url: string }> => {
      const token = getToken();
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`${API_BASE}/api/admin/listings/${id}/asset/${kind}`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      });
      if (res.status === 401) throw new Error("UNAUTHORIZED");
      if (!res.ok) throw new Error("Upload failed");
      return res.json();
    },
    deleteAsset: (id: string, kind: "agent_photo" | "brokerage_logo") =>
      request<{ listing: ExampleListing }>(`/api/admin/listings/${id}/asset/${kind}`, {
        method: "DELETE",
      }),
    mlsLookup: (mlsId: string) =>
      request<{ available: boolean; data?: Partial<ListingInput> }>(`/api/admin/mls-lookup/${encodeURIComponent(mlsId)}`),
  },

  domains: {
    search: (body: { domain?: string; address?: string; city?: string }) =>
      request<{ results: DomainSearchResult[] }>("/api/admin/domain/search", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    register: (body: { domain: string; notes?: string }) =>
      request<{ domain: unknown; registration: unknown; zone: unknown }>("/api/admin/domain/register", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    assign: (body: { domain: string; listingId: string }) =>
      request<{ listing: ExampleListing; registration: unknown; zone: unknown }>("/api/admin/domain/assign", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    unassign: (listingId: string) =>
      request<{ listing: ExampleListing }>("/api/admin/domain/unassign", {
        method: "POST",
        body: JSON.stringify({ listingId }),
      }),
    list: () => request<{ domains: DomainEntry[] }>("/api/admin/domain/list"),
    listDns: (domain: string) =>
      request<{ zoneId: string; nameServers: string[]; records: DnsRecord[] }>(`/api/admin/domain/dns/${encodeURIComponent(domain)}`),
    addDns: (
      domain: string,
      body: { type: "A" | "TXT"; name: string; content: string; ttl?: number; proxied?: boolean },
    ) =>
      request<{ record: DnsRecord }>(`/api/admin/domain/dns/${encodeURIComponent(domain)}`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    deleteDns: (domain: string, recordId: string) =>
      request<{ success: boolean }>(
        `/api/admin/domain/dns/${encodeURIComponent(domain)}/${encodeURIComponent(recordId)}`,
        { method: "DELETE" },
      ),
  },

  simulator: {
    run: (body: {
      address: string;
      city?: string;
      state?: string;
      zip?: string;
      priceUsd?: number;
      beds?: number;
      baths?: number;
      sqft?: number;
      agentFirstName: string;
      agentLastName?: string;
      agentEmail: string;
      agentPhone?: string;
      agentBrokerage?: string;
      sendEmail?: boolean;
    }) =>
      request<{
        success: boolean;
        listing: ExampleListing;
        previewUrl: string;
        activateUrl: string;
        emailStatus: "sent" | "skipped" | "failed";
        emailError?: string;
      }>("/api/admin/simulate-mls", {
        method: "POST",
        body: JSON.stringify(body),
      }),
  },

  dashboard: {
    get: () => request<{
      outreach: {
        sentToday: number; sent7d: number; sent30d: number;
        pendingQueue: number; failed: number; cancelled: number; suppressed: number; pendingNoPhoto: number;
      };
      clicks: {
        clicksToday: number; clicks7d: number;
        uniqueAgents7d: number; activateClicks7d: number;
      };
      revenue: {
        paidActive: number; claimedTrial: number;
        totalMlsListings: number; newListings7d: number; totalAgents: number;
      };
      mlsSync: {
        healthy: boolean; minutesSinceSync: number | null;
        lastSuccessAt: string | null; lastDeltaSyncAt: string | null;
        lastFullSyncAt: string | null; lastError: string | null;
        lastErrorAt: string | null; totalListings: number;
      } | null;
      dailySent: { day: string; count: number }[];
    }>("/api/admin/dashboard"),
  },

  verifyPassword: (password: string) =>
    request<{ listings: ExampleListing[] }>("/api/admin/listings", {
      headers: { Authorization: `Bearer ${password}` },
    }),
};
