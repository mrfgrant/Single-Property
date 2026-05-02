import React, { useState } from "react";
import { Link } from "wouter";
import { sampleListings, searchListings, formatPrice, type SampleListing } from "@/data/sampleListings";
import { Bed, Bath, Square, Search, X, ExternalLink, Eye } from "lucide-react";

const BASE = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

function ListingCard({ listing, onPreview }: { listing: SampleListing; onPreview: (slug: string) => void }) {
  const gradients = [
    "from-[#1a2e1a] to-[#2d4a2d]",
    "from-[#1e2a3a] to-[#2a3d52]",
    "from-[#2a1e1e] to-[#3d2a2a]",
    "from-[#1e1e2a] to-[#2a2a3d]",
    "from-[#2a2a1e] to-[#3d3d2a]",
    "from-[#1a2a2e] to-[#2d3d4a]",
  ];
  const grad = gradients[listing.address.length % gradients.length];

  return (
    <div
      className="group border border-border rounded-lg overflow-hidden hover:shadow-md transition-shadow cursor-pointer bg-white"
      onClick={() => onPreview(listing.slug)}
    >
      <div className={`h-44 bg-gradient-to-br ${grad} flex items-end justify-between p-4`}>
        <span className="inline-flex items-center bg-gold text-white text-sm font-bold px-3 py-1 rounded-full">
          {formatPrice(listing.price)}
        </span>
        <span className="inline-flex items-center gap-1 bg-white/10 border border-white/20 text-white text-xs px-2.5 py-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
          <Eye size={11} />
          Preview
        </span>
      </div>

      <div className="p-4">
        <p className="font-semibold text-ink text-sm leading-tight mb-1 group-hover:text-gold transition-colors">
          {listing.address}
        </p>
        <p className="text-xs text-muted mb-3">
          {listing.city}, {listing.state} {listing.zip}
        </p>

        <div className="flex items-center gap-4 text-xs text-muted">
          <span className="flex items-center gap-1">
            <Bed size={13} className="text-muted/70" />
            {listing.beds} bd
          </span>
          <span className="flex items-center gap-1">
            <Bath size={13} className="text-muted/70" />
            {listing.baths} ba
          </span>
          <span className="flex items-center gap-1">
            <Square size={13} className="text-muted/70" />
            {listing.sqft.toLocaleString()} sqft
          </span>
        </div>

        <div className="mt-3 pt-3 border-t border-border/60 flex items-center justify-between">
          <span className="text-xs text-muted">{listing.agentBrokerage}</span>
          <span className="text-xs text-gold font-medium group-hover:underline">View site →</span>
        </div>
      </div>
    </div>
  );
}

function PreviewDrawer({ slug, onClose }: { slug: string; onClose: () => void }) {
  const url = `${BASE}/listing/${slug}`;

  return (
    <div className="fixed inset-0 z-50 flex" onClick={onClose}>
      {/* Backdrop */}
      <div className="flex-1 bg-black/40 backdrop-blur-sm" />

      {/* Panel */}
      <div
        className="relative w-full max-w-[520px] bg-white shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50 shrink-0">
          <div className="min-w-0">
            <p className="text-xs text-gray-500 mb-0.5">PropSite property preview</p>
            <p className="text-sm font-mono font-medium text-gray-800 truncate">{slug.replace(/-/g, " ")}</p>
          </div>
          <div className="flex items-center gap-2 ml-3 shrink-0">
            <Link
              href={`/listing/${slug}`}
              onClick={onClose}
              className="flex items-center gap-1.5 h-8 px-3 text-xs font-medium bg-gold text-white rounded-lg hover:bg-gold/90 transition-colors"
            >
              <ExternalLink size={11} />
              Full page
            </Link>
            <button
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* iframe */}
        <iframe
          src={url}
          className="flex-1 w-full border-0"
          title={`Preview: ${slug}`}
        />
      </div>
    </div>
  );
}

export function DemoListings() {
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [previewSlug, setPreviewSlug] = useState<string | null>(null);

  const DEFAULT_COUNT = 4;
  const defaultListings = sampleListings.slice(0, DEFAULT_COUNT);
  const results = query.trim() ? searchListings(query) : (showAll ? sampleListings : defaultListings);
  const isFiltering = query.trim().length > 0;
  const hasMore = !isFiltering && !showAll && sampleListings.length > DEFAULT_COUNT;

  return (
    <>
      <section id="demo" className="py-20 px-6 lg:px-12 bg-cream">
        <div className="max-w-[1200px] mx-auto">
          <div className="text-center mb-10">
            <p className="text-xs font-semibold uppercase tracking-widest text-gold mb-3">See It In Action</p>
            <h2 className="text-3xl md:text-4xl font-serif font-bold text-ink mb-4">
              Real sites. Real addresses.
            </h2>
            <p className="text-muted max-w-lg mx-auto">
              Every listing below is a full property website — the same kind PropSite builds for agents automatically. Click any card to explore.
            </p>
          </div>

          {/* Search */}
          <div className="relative max-w-md mx-auto mb-10">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted/60" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by address, city, or zip…"
              className="w-full h-12 pl-10 pr-4 rounded-full border border-border bg-white text-sm focus:outline-none focus:border-ink placeholder:text-muted/60"
            />
          </div>

          {/* Grid */}
          {results.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {results.map((listing) => (
                <ListingCard key={listing.slug} listing={listing} onPreview={setPreviewSlug} />
              ))}
            </div>
          ) : (
            <div className="text-center py-16 text-muted">
              <p className="text-lg font-serif italic mb-2">"{query}"</p>
              <p className="text-sm">Your listing goes here — set up in 90 seconds.</p>
              <a href="#" className="mt-4 inline-block text-sm text-gold hover:underline font-medium">
                Get started →
              </a>
            </div>
          )}

          {/* Show all / collapse */}
          {hasMore && (
            <div className="text-center mt-10">
              <button
                onClick={() => setShowAll(true)}
                className="h-11 px-8 border border-ink text-ink text-sm font-medium rounded hover:bg-ink hover:text-warm-white transition-colors"
              >
                Browse all {sampleListings.length} examples →
              </button>
            </div>
          )}
          {showAll && !isFiltering && (
            <div className="text-center mt-10">
              <button
                onClick={() => setShowAll(false)}
                className="text-sm text-muted hover:text-ink transition-colors underline"
              >
                Show fewer
              </button>
            </div>
          )}
        </div>
      </section>

      {/* Preview drawer */}
      {previewSlug && (
        <PreviewDrawer slug={previewSlug} onClose={() => setPreviewSlug(null)} />
      )}
    </>
  );
}
