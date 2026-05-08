import React, { useState, useRef } from "react";
import { api, type ExampleListing, type ListingInput } from "@/lib/api";
import { ArrowLeft, Upload, X, Loader2, Search } from "lucide-react";

interface Props {
  listing: ExampleListing | null;
  onSave: () => void;
  onCancel: () => void;
}

function slugify(address: string, city: string, state: string) {
  return `${address} ${city} ${state}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-700 mb-1.5">{label}</label>
      {children}
      {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
    </div>
  );
}

function AssetUploader({
  label,
  hint,
  url,
  shape,
  onUpload,
  onRemove,
  onError,
}: {
  label: string;
  hint?: string;
  url: string | null;
  shape: "circle" | "rect";
  onUpload: (file: File) => Promise<void>;
  onRemove: () => Promise<void>;
  onError: (msg: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const apiBase = import.meta.env.VITE_API_URL ?? "";
  const displayUrl = url
    ? url.startsWith("/objects/")
      ? `${apiBase}/api/storage${url}`
      : url
    : null;

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      await onUpload(file);
    } catch (err: any) {
      onError(`${label} upload failed: ${err.message}`);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const handleRemove = async () => {
    if (!confirm(`Remove ${label.toLowerCase()}?`)) return;
    setBusy(true);
    try {
      await onRemove();
    } catch (err: any) {
      onError(`Failed to remove ${label.toLowerCase()}: ${err.message}`);
    } finally {
      setBusy(false);
    }
  };

  const previewClass = shape === "circle"
    ? "w-20 h-20 rounded-full"
    : "w-24 h-16 rounded-md";
  const placeholderClass = shape === "circle"
    ? "w-20 h-20 rounded-full bg-gray-100 border-2 border-dashed border-gray-300"
    : "w-24 h-16 rounded-md bg-gray-100 border-2 border-dashed border-gray-300";

  return (
    <div>
      <label className="block text-xs font-semibold text-gray-700 mb-2">{label}</label>
      <div className="flex items-center gap-3">
        {displayUrl ? (
          <img src={displayUrl} alt={label} className={`${previewClass} object-cover bg-gray-100 border border-gray-200`} />
        ) : (
          <div className={`${placeholderClass} flex items-center justify-center text-gray-300`}>
            <Upload size={18} />
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="text-xs font-medium text-amber-700 hover:text-amber-800 disabled:opacity-50 text-left"
          >
            {busy ? (
              <span className="inline-flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" /> Working…</span>
            ) : displayUrl ? "Replace" : "Upload"}
          </button>
          {displayUrl && !busy && (
            <button
              type="button"
              onClick={handleRemove}
              className="text-xs text-gray-500 hover:text-red-600 text-left"
            >
              Remove
            </button>
          )}
          {hint && <p className="text-[10px] text-gray-400 leading-snug max-w-[140px]">{hint}</p>}
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleFile}
      />
    </div>
  );
}

const inputClass = "w-full h-10 px-3 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent bg-white";
const textareaClass = "w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent bg-white resize-none";

export default function ListingForm({ listing, onSave, onCancel }: Props) {
  const isEdit = !!listing;
  const [tab, setTab] = useState<"manual" | "mls">("manual");
  const [mlsId, setMlsId] = useState("");
  const [mlsLoading, setMlsLoading] = useState(false);
  const [mlsMsg, setMlsMsg] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [photoUploading, setPhotoUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState<Partial<ListingInput>>({
    mlsId: listing?.mlsId ?? "",
    slug: listing?.slug ?? "",
    address: listing?.address ?? "",
    city: listing?.city ?? "",
    state: listing?.state ?? "GA",
    zip: listing?.zip ?? "",
    priceUsd: listing?.priceUsd ?? undefined,
    beds: listing?.beds ?? undefined,
    baths: listing?.baths ?? undefined,
    sqft: listing?.sqft ?? undefined,
    lotAcres: listing?.lotAcres ?? undefined,
    yearBuilt: listing?.yearBuilt ?? undefined,
    garage: listing?.garage ?? false,
    description: listing?.description ?? "",
    agentName: listing?.agentName ?? "",
    agentPhone: listing?.agentPhone ?? "",
    agentEmail: listing?.agentEmail ?? "",
    agentBrokerage: listing?.agentBrokerage ?? "",
    agentPhotoUrl: listing?.agentPhotoUrl ?? null,
    brokerageLogoUrl: listing?.brokerageLogoUrl ?? null,
    walkScore: listing?.walkScore ?? undefined,
    bikeScore: listing?.bikeScore ?? undefined,
    schoolRating: listing?.schoolRating ?? undefined,
    transitScore: listing?.transitScore ?? undefined,
    status: listing?.status ?? "active",
    featured: listing?.featured ?? false,
    photoUrls: listing?.photoUrls ?? [],
  });

  const set = (field: keyof ListingInput, value: any) => {
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      if ((field === "address" || field === "city" || field === "state") && !isEdit) {
        next.slug = slugify(
          (field === "address" ? value : prev.address) ?? "",
          (field === "city" ? value : prev.city) ?? "",
          (field === "state" ? value : prev.state) ?? "",
        );
      }
      return next;
    });
  };

  const handleMlsLookup = async () => {
    if (!mlsId.trim()) return;
    setMlsLoading(true);
    setMlsMsg("");
    try {
      const res = await api.listings.mlsLookup(mlsId.trim());
      if (!res.available) {
        setMlsMsg("MLS integration not yet configured — please enter listing details manually.");
      } else if (res.data) {
        setForm((prev) => {
          const merged = { ...prev, ...res.data, mlsId: mlsId.trim() };
          // Auto-generate slug from MLS-prefilled address/city/state.
          // The handleChange path only computes slug on direct input,
          // so MLS prefill needs its own slug derivation here. Only
          // overwrite the slug on new (non-edit) listings to avoid
          // clobbering an existing public URL.
          if (!isEdit) {
            merged.slug = slugify(
              merged.address ?? "",
              merged.city ?? "",
              merged.state ?? "",
            );
          }
          return merged;
        });
        setTab("manual");
        setMlsMsg("Fields pre-populated from MLS. Review and save.");
      }
    } catch {
      setMlsMsg("Lookup failed. Enter details manually.");
    } finally {
      setMlsLoading(false);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length || !listing) return;
    setPhotoUploading(true);
    try {
      for (const file of files) {
        const res = await api.listings.uploadPhoto(listing.id, file);
        setForm((prev) => ({ ...prev, photoUrls: res.listing.photoUrls ?? [] }));
      }
    } catch (err: any) {
      setError("Photo upload failed: " + err.message);
    } finally {
      setPhotoUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDeletePhoto = async (index: number) => {
    if (!listing) return;
    if (!confirm("Remove this photo?")) return;
    try {
      const res = await api.listings.deletePhoto(listing.id, index);
      setForm((prev) => ({ ...prev, photoUrls: res.listing.photoUrls ?? [] }));
    } catch (err: any) {
      setError("Failed to remove photo: " + err.message);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      if (isEdit) {
        await api.listings.update(listing!.id, form);
      } else {
        await api.listings.create(form);
      }
      onSave();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const numericField = (field: keyof ListingInput) => ({
    value: form[field] as number ?? "",
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = e.target.value;
      set(field, v === "" ? undefined : Number(v));
    },
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-4 sticky top-0 z-10">
        <button onClick={onCancel} className="p-1.5 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors">
          <ArrowLeft size={18} />
        </button>
        <div>
          <p className="text-sm font-semibold text-gray-900">
            {isEdit ? `Edit: ${listing!.address}` : "Add new listing"}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            {isEdit ? "Update listing details and photos" : "Create an example listing for the marketing site"}
          </p>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8">
        {/* Tab switcher — only for new listings */}
        {!isEdit && (
          <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-8 w-fit">
            {(["manual", "mls"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  tab === t ? "bg-white text-gray-900 shadow-sm" : "text-gray-600 hover:text-gray-900"
                }`}
              >
                {t === "manual" ? "Manual Entry" : "MLS Lookup"}
              </button>
            ))}
          </div>
        )}

        {/* MLS Lookup tab */}
        {tab === "mls" && !isEdit && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mb-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">Look up by MLS Listing ID</h3>
            <div className="flex gap-3">
              <input
                type="text"
                value={mlsId}
                onChange={(e) => setMlsId(e.target.value)}
                placeholder="e.g. AGMLS-2024-0034"
                className={inputClass + " flex-1"}
                onKeyDown={(e) => e.key === "Enter" && handleMlsLookup()}
              />
              <button
                onClick={handleMlsLookup}
                disabled={mlsLoading || !mlsId.trim()}
                className="flex items-center gap-2 h-10 px-5 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 disabled:opacity-50 transition-colors"
              >
                {mlsLoading ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
                Fetch
              </button>
            </div>
            {mlsMsg && (
              <p className="mt-3 text-sm text-gray-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                {mlsMsg}
              </p>
            )}
          </div>
        )}

        <form onSubmit={handleSave}>
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mb-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-5 pb-3 border-b border-gray-100">Property Details</h3>
            <div className="grid grid-cols-1 gap-5">
              <div className="grid grid-cols-2 gap-4">
                <Field label="MLS ID (optional)">
                  <input className={inputClass} value={form.mlsId ?? ""} onChange={(e) => set("mlsId", e.target.value)} placeholder="AGMLS-2024-0034" />
                </Field>
                <Field label="URL Slug" hint="Auto-generated from address; must be unique">
                  <input className={inputClass} value={form.slug ?? ""} onChange={(e) => set("slug", e.target.value)} required placeholder="412-walton-way-augusta-ga" />
                </Field>
              </div>

              <Field label="Street Address" >
                <input className={inputClass} value={form.address ?? ""} onChange={(e) => set("address", e.target.value)} required placeholder="412 Walton Way" />
              </Field>

              <div className="grid grid-cols-3 gap-4">
                <Field label="City">
                  <input className={inputClass} value={form.city ?? ""} onChange={(e) => set("city", e.target.value)} required placeholder="Augusta" />
                </Field>
                <Field label="State">
                  <input className={inputClass} value={form.state ?? ""} onChange={(e) => set("state", e.target.value)} required placeholder="GA" maxLength={2} />
                </Field>
                <Field label="ZIP Code">
                  <input className={inputClass} value={form.zip ?? ""} onChange={(e) => set("zip", e.target.value)} placeholder="30901" />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Field label="List Price ($)">
                  <input className={inputClass} type="number" {...numericField("priceUsd")} placeholder="489000" />
                </Field>
                <Field label="Year Built">
                  <input className={inputClass} type="number" {...numericField("yearBuilt")} placeholder="2004" />
                </Field>
              </div>

              <div className="grid grid-cols-4 gap-4">
                <Field label="Beds">
                  <input className={inputClass} type="number" {...numericField("beds")} placeholder="4" />
                </Field>
                <Field label="Baths">
                  <input className={inputClass} type="number" step="0.5" {...numericField("baths")} placeholder="3" />
                </Field>
                <Field label="Sq Ft">
                  <input className={inputClass} type="number" {...numericField("sqft")} placeholder="2840" />
                </Field>
                <Field label="Lot (acres)">
                  <input className={inputClass} type="number" step="0.01" {...numericField("lotAcres")} placeholder="0.42" />
                </Field>
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="garage"
                  checked={form.garage ?? false}
                  onChange={(e) => set("garage", e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500"
                />
                <label htmlFor="garage" className="text-sm font-medium text-gray-700">Garage</label>
              </div>

              <Field label="Description">
                <textarea className={textareaClass} rows={4} value={form.description ?? ""} onChange={(e) => set("description", e.target.value)} placeholder="Describe the property…" />
              </Field>
            </div>
          </div>

          {/* Neighborhood Scores */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mb-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-5 pb-3 border-b border-gray-100">Neighborhood Scores (0–100)</h3>
            <div className="grid grid-cols-4 gap-4">
              <Field label="Walk Score">
                <input className={inputClass} type="number" min={0} max={100} {...numericField("walkScore")} placeholder="72" />
              </Field>
              <Field label="Bike Score">
                <input className={inputClass} type="number" min={0} max={100} {...numericField("bikeScore")} placeholder="58" />
              </Field>
              <Field label="School Rating (0–10)">
                <input className={inputClass} type="number" min={0} max={10} {...numericField("schoolRating")} placeholder="8" />
              </Field>
              <Field label="Transit Score">
                <input className={inputClass} type="number" min={0} max={100} {...numericField("transitScore")} placeholder="34" />
              </Field>
            </div>
          </div>

          {/* Agent Info */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mb-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-5 pb-3 border-b border-gray-100">Listing Agent</h3>
            <div className="grid grid-cols-2 gap-4 mb-5">
              <Field label="Agent Name">
                <input className={inputClass} value={form.agentName ?? ""} onChange={(e) => set("agentName", e.target.value)} placeholder="Sarah Richardson" />
              </Field>
              <Field label="Brokerage">
                <input className={inputClass} value={form.agentBrokerage ?? ""} onChange={(e) => set("agentBrokerage", e.target.value)} placeholder="Meybohm Real Estate" />
              </Field>
              <Field label="Agent Phone">
                <input className={inputClass} type="tel" value={form.agentPhone ?? ""} onChange={(e) => set("agentPhone", e.target.value)} placeholder="(706) 555-0100" />
              </Field>
              <Field label="Agent Email">
                <input className={inputClass} type="email" value={form.agentEmail ?? ""} onChange={(e) => set("agentEmail", e.target.value)} placeholder="agent@example.com" />
              </Field>
            </div>

            {/* Agent photo & brokerage logo uploads — only when editing */}
            {isEdit ? (
              <div className="grid grid-cols-2 gap-4 pt-5 border-t border-gray-100">
                <AssetUploader
                  label="Agent photo"
                  hint="Square portrait, JPEG/PNG/WebP"
                  url={form.agentPhotoUrl ?? null}
                  shape="circle"
                  onUpload={async (file) => {
                    const res = await api.listings.uploadAsset(listing!.id, "agent_photo", file);
                    setForm((p) => ({ ...p, agentPhotoUrl: res.listing.agentPhotoUrl ?? null }));
                  }}
                  onRemove={async () => {
                    const res = await api.listings.deleteAsset(listing!.id, "agent_photo");
                    setForm((p) => ({ ...p, agentPhotoUrl: res.listing.agentPhotoUrl ?? null }));
                  }}
                  onError={setError}
                />
                <AssetUploader
                  label="Brokerage logo"
                  hint="PNG with transparency preferred"
                  url={form.brokerageLogoUrl ?? null}
                  shape="rect"
                  onUpload={async (file) => {
                    const res = await api.listings.uploadAsset(listing!.id, "brokerage_logo", file);
                    setForm((p) => ({ ...p, brokerageLogoUrl: res.listing.brokerageLogoUrl ?? null }));
                  }}
                  onRemove={async () => {
                    const res = await api.listings.deleteAsset(listing!.id, "brokerage_logo");
                    setForm((p) => ({ ...p, brokerageLogoUrl: res.listing.brokerageLogoUrl ?? null }));
                  }}
                  onError={setError}
                />
              </div>
            ) : (
              <p className="text-xs text-gray-400 pt-5 border-t border-gray-100">
                Save the listing first, then upload agent photo and brokerage logo.
              </p>
            )}
          </div>

          {/* Visibility */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mb-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-5 pb-3 border-b border-gray-100">Visibility</h3>
            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className="text-xs font-semibold text-gray-700 block mb-1.5">Status</label>
                <select
                  className={inputClass}
                  value={form.status}
                  onChange={(e) => set("status", e.target.value)}
                >
                  <option value="active">Active — visible on marketing site</option>
                  <option value="hidden">Hidden — not shown publicly</option>
                </select>
              </div>
              <div className="flex items-start gap-3 pt-6">
                <input
                  type="checkbox"
                  id="featured"
                  checked={form.featured ?? false}
                  onChange={(e) => set("featured", e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500"
                />
                <div>
                  <label htmlFor="featured" className="text-sm font-semibold text-gray-700">Featured</label>
                  <p className="text-xs text-gray-400 mt-0.5">Shows in top 6 cards on the home page</p>
                </div>
              </div>
            </div>
          </div>

          {/* Photos — only shown when editing existing listings */}
          {isEdit && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mb-6">
              <h3 className="text-sm font-semibold text-gray-900 mb-5 pb-3 border-b border-gray-100">Photos</h3>

              {/* Thumbnails */}
              {(form.photoUrls?.length ?? 0) > 0 && (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 mb-4">
                  {form.photoUrls!.map((url, i) => (
                    <div key={i} className="relative group aspect-video rounded-lg overflow-hidden bg-gray-100 border border-gray-200">
                      <img src={url} alt="" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => handleDeletePhoto(i)}
                        className="absolute top-1.5 right-1.5 p-1 bg-black/60 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/80"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Upload area */}
              <div
                className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-gray-400 transition-colors cursor-pointer"
                onClick={() => fileInputRef.current?.click()}
              >
                {photoUploading ? (
                  <div className="flex items-center justify-center gap-2 text-gray-500">
                    <Loader2 size={18} className="animate-spin" />
                    <span className="text-sm">Uploading…</span>
                  </div>
                ) : (
                  <>
                    <Upload size={24} className="mx-auto text-gray-400 mb-2" />
                    <p className="text-sm text-gray-600 font-medium">Click to upload photos</p>
                    <p className="text-xs text-gray-400 mt-1">JPEG, PNG or WebP · Max 10 MB each</p>
                  </>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                className="hidden"
                onChange={handlePhotoUpload}
              />

              {!isEdit && (
                <p className="text-xs text-gray-400 mt-2 text-center">Save the listing first, then upload photos</p>
              )}
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg mb-4">
              {error}
            </div>
          )}

          <div className="flex items-center gap-3 justify-end">
            <button type="button" onClick={onCancel} className="h-10 px-5 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-100 transition-colors">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 h-10 px-6 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 disabled:opacity-50 transition-colors"
            >
              {saving && <Loader2 size={15} className="animate-spin" />}
              {saving ? "Saving…" : isEdit ? "Save changes" : "Create listing"}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
