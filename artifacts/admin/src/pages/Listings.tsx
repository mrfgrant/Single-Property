import React, { useEffect, useState } from "react";
import { api, type ExampleListing } from "@/lib/api";
import { clearToken } from "@/lib/auth";
import { Plus, Pencil, Trash2, Star, Eye, EyeOff, Link2, XCircle, ExternalLink } from "lucide-react";

interface Props {
  onEdit: (listing: ExampleListing | null) => void;
  onAssignDomain: (listing: ExampleListing) => void;
  onListingsLoaded: (listings: ExampleListing[]) => void;
}

function formatPrice(price: number | null | undefined) {
  if (!price) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(price);
}

export default function Listings({ onEdit, onAssignDomain, onListingsLoaded }: Props) {
  const [listings, setListings] = useState<ExampleListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);
  const [unassigning, setUnassigning] = useState<string | null>(null);

  const handleLogout = () => {
    clearToken();
    window.location.reload();
  };

  const load = async () => {
    try {
      const res = await api.listings.list();
      setListings(res.listings);
      onListingsLoaded(res.listings);
    } catch (e: any) {
      if (e.message === "UNAUTHORIZED") { handleLogout(); return; }
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleDelete = async (id: string) => {
    if (!confirm("Archive this listing? It will be hidden from the marketing site.")) return;
    setDeleting(id);
    try {
      await api.listings.remove(id);
      await load();
    } catch (e: any) {
      alert("Failed to delete: " + e.message);
    } finally {
      setDeleting(null);
    }
  };

  const handleToggleFeatured = async (listing: ExampleListing) => {
    try {
      await api.listings.update(listing.id, { featured: !listing.featured });
      await load();
    } catch (e: any) {
      alert("Failed to update: " + e.message);
    }
  };

  const handleToggleStatus = async (listing: ExampleListing) => {
    const newStatus = listing.status === "active" ? "hidden" : "active";
    try {
      await api.listings.update(listing.id, { status: newStatus });
      await load();
    } catch (e: any) {
      alert("Failed to update: " + e.message);
    }
  };

  const handleUnassignDomain = async (listing: ExampleListing) => {
    if (!confirm(`Remove domain "${listing.domainName}" from this listing?`)) return;
    setUnassigning(listing.id);
    try {
      await api.domains.unassign(listing.id);
      await load();
    } catch (e: any) {
      alert("Failed to unassign: " + e.message);
    } finally {
      setUnassigning(null);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Example Listings</h2>
          <p className="text-sm text-gray-500 mt-0.5">Active listings appear on the marketing site demo section.</p>
        </div>
        <button
          onClick={() => onEdit(null)}
          className="flex items-center gap-2 h-9 px-4 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors"
        >
          <Plus size={16} />
          Add listing
        </button>
      </div>

      {loading && (
        <div className="text-center py-20 text-gray-400 text-sm">Loading listings…</div>
      )}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg mb-6">
          {error}
        </div>
      )}
      {!loading && listings.length === 0 && !error && (
        <div className="text-center py-20">
          <p className="text-gray-500 text-sm mb-4">No listings yet.</p>
          <button
            onClick={() => onEdit(null)}
            className="h-10 px-6 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors"
          >
            Add your first listing
          </button>
        </div>
      )}
      {!loading && listings.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
            <p className="text-sm font-medium text-gray-700">
              {listings.length} listing{listings.length !== 1 ? "s" : ""}
            </p>
            <p className="text-xs text-gray-400">Active listings appear on the marketing site</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Address</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Price</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Beds / Baths</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Domain</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Photos</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Featured</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {listings.map((l) => (
                  <tr key={l.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-4">
                      <p className="font-medium text-gray-900">{l.address}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{l.city}, {l.state} {l.zip}</p>
                    </td>
                    <td className="px-4 py-4 text-gray-700 font-medium">{formatPrice(l.priceUsd)}</td>
                    <td className="px-4 py-4 text-gray-600">
                      {l.beds ?? "—"} bd / {l.baths ?? "—"} ba
                    </td>
                    <td className="px-4 py-4">
                      {l.domainName ? (
                        <div className="flex items-center gap-1.5 max-w-[180px]">
                          <span className="text-xs font-mono text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded truncate">
                            {l.domainName}
                          </span>
                          <button
                            onClick={() => handleUnassignDomain(l)}
                            disabled={unassigning === l.id}
                            className="text-gray-300 hover:text-red-400 transition-colors shrink-0"
                            title="Remove domain"
                          >
                            <XCircle size={13} />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => onAssignDomain(l)}
                          className="flex items-center gap-1 text-xs text-gray-400 hover:text-amber-600 hover:bg-amber-50 px-2 py-1 rounded-lg transition-colors"
                          title="Assign domain"
                        >
                          <Link2 size={12} />
                          Assign
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-4 text-gray-600">
                      {l.photoUrls?.length ?? 0} photo{(l.photoUrls?.length ?? 0) !== 1 ? "s" : ""}
                    </td>
                    <td className="px-4 py-4 text-center">
                      <button
                        onClick={() => handleToggleFeatured(l)}
                        className={`p-1.5 rounded-lg transition-colors ${
                          l.featured
                            ? "bg-amber-50 text-amber-600 hover:bg-amber-100"
                            : "bg-gray-100 text-gray-400 hover:bg-gray-200"
                        }`}
                        title={l.featured ? "Remove from featured" : "Mark as featured"}
                      >
                        <Star size={16} fill={l.featured ? "currentColor" : "none"} />
                      </button>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <button
                        onClick={() => handleToggleStatus(l)}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                          l.status === "active"
                            ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                            : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                        }`}
                      >
                        {l.status === "active" ? <Eye size={11} /> : <EyeOff size={11} />}
                        {l.status}
                      </button>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2 justify-end">
                        <a
                          href={`/listing/${l.slug}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                          title="Preview listing site"
                        >
                          <ExternalLink size={15} />
                        </a>
                        <button
                          onClick={() => onEdit(l)}
                          className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                          title="Edit"
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          onClick={() => handleDelete(l.id)}
                          disabled={deleting === l.id}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                          title="Archive"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
