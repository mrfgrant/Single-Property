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
  photoUrls?: string[] | null;
  walkScore?: number | null;
  bikeScore?: number | null;
  schoolRating?: number | null;
  transitScore?: number | null;
  status: string;
  featured: boolean;
  createdAt: string;
  updatedAt: string;
}

export type ListingInput = Omit<ExampleListing, "id" | "createdAt" | "updatedAt">;

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
    mlsLookup: (mlsId: string) =>
      request<{ available: boolean; data?: Partial<ListingInput> }>(`/api/admin/mls-lookup/${encodeURIComponent(mlsId)}`),
  },
  verifyPassword: (password: string) =>
    request<{ listings: ExampleListing[] }>("/api/admin/listings", {
      headers: { Authorization: `Bearer ${password}` },
    }),
};
