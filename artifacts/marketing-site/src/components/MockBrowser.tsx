import React from "react";
import { motion } from "framer-motion";
import type { PublicListing } from "@/lib/publicListings";

interface Props {
  listing?: PublicListing | null;
}

function fmtPrice(n: number): string {
  return `$${n.toLocaleString()}`;
}

function fmtSqft(n: number): string {
  return `${n.toLocaleString()} sqft`;
}

function fmtBaths(n: number): string {
  const whole = Math.floor(n);
  return n === whole ? `${whole} bath` : `${n} bath`;
}

function fmtLot(acres: number): string {
  if (!acres) return "";
  return `${acres} acre lot`;
}

function deriveDomain(listing: PublicListing): string {
  if (listing.domainName) return listing.domainName;
  return `${listing.address.toLowerCase().replace(/[^a-z0-9]/g, "")}.com`;
}

export function MockBrowser({ listing }: Props) {
  // Defaults match the seeded "2918 Arrowhead Drive" listing so the
  // mock still looks correct on first paint before fetch resolves.
  const data = listing ?? {
    address: "2918 Arrowhead Drive",
    city: "Augusta",
    state: "GA",
    price: 185000,
    beds: 3,
    baths: 3,
    sqft: 1836,
    lotAcres: 0.11,
    walkScore: 80,
    bikeScore: 60,
    schoolRating: 10,
    transitScore: 35,
    domainName: "2918arrowheaddrive.com",
    photoUrls: undefined as string[] | undefined,
  };

  const heroPhoto = data.photoUrls?.[0];
  const lotLabel = data.lotAcres ? fmtLot(data.lotAcres) : "";

  return (
    <div className="w-full max-w-[600px] mx-auto rounded-[6px] border border-[rgba(255,255,255,0.1)] bg-ink overflow-hidden flex flex-col font-sans text-left">
      {/* Browser Chrome */}
      <div className="flex items-center px-4 py-3 bg-[rgba(255,255,255,0.05)] border-b border-[rgba(255,255,255,0.1)] relative">
        <div className="flex gap-2">
          <div className="w-3 h-3 rounded-full bg-[#ff5f56]" />
          <div className="w-3 h-3 rounded-full bg-[#ffbd2e]" />
          <div className="w-3 h-3 rounded-full bg-[#27c93f]" />
        </div>
        <div className="absolute left-1/2 -translate-x-1/2 w-1/2 md:w-[240px] h-6 rounded bg-[rgba(255,255,255,0.1)] text-center text-[11px] leading-6 text-[rgba(255,255,255,0.5)] truncate px-4">
          {deriveDomain(data as PublicListing)}
        </div>
        <div className="ml-auto flex items-center gap-2 text-[11px] font-medium text-[#28a865]">
          <motion.div
            className="w-2 h-2 rounded-full bg-[#28a865]"
            animate={{ opacity: [1, 0.4, 1] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          />
          Live
        </div>
      </div>

      {/* Hero Image Area */}
      <div
        className="relative h-[240px] md:h-[300px] bg-gradient-to-b from-[#1b3b36] to-[#0f2420] p-6 flex flex-col justify-end bg-cover bg-center"
        style={heroPhoto ? { backgroundImage: `linear-gradient(to bottom, rgba(10,30,58,0.25), rgba(10,30,58,0.85)), url(${heroPhoto})` } : undefined}
      >
        {/* Price Tag */}
        <div className="absolute top-6 left-6 px-4 py-1.5 rounded-full bg-gold text-white font-serif font-bold text-lg">
          {fmtPrice(data.price)}
        </div>

        {/* Address */}
        <div className="mt-auto">
          <h2 className="text-white font-serif text-3xl md:text-4xl leading-tight font-bold mb-2">
            {data.address},<br />
            {data.city} {data.state}
          </h2>
          <div className="flex flex-wrap items-center gap-2 text-sm text-[rgba(255,255,255,0.8)] font-light">
            <span>{data.beds} bed</span>
            <span>&middot;</span>
            <span>{fmtBaths(data.baths)}</span>
            <span>&middot;</span>
            <span>{fmtSqft(data.sqft)}</span>
            {lotLabel && (
              <>
                <span>&middot;</span>
                <span>{lotLabel}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Content Area */}
      <div className="p-6 bg-white">
        {/* Neighborhood Scores */}
        <div className="flex flex-wrap gap-2 mb-8">
          <span className="px-3 py-1 bg-cream text-ink text-xs font-medium rounded-full border border-border">Walk {data.walkScore}</span>
          <span className="px-3 py-1 bg-cream text-ink text-xs font-medium rounded-full border border-border">Bike {data.bikeScore}</span>
          <span className="px-3 py-1 bg-cream text-ink text-xs font-medium rounded-full border border-border">Schools {data.schoolRating}/10</span>
          <span className="px-3 py-1 bg-cream text-ink text-xs font-medium rounded-full border border-border">Transit {data.transitScore}</span>
        </div>

        {/* Lead Capture Form Mockup */}
        <div className="bg-warm-white border border-border rounded p-6">
          <h3 className="font-serif text-xl font-bold mb-4 text-ink">Interested?</h3>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="h-10 border border-border bg-white rounded px-3 text-xs text-muted flex items-center">First Name</div>
            <div className="h-10 border border-border bg-white rounded px-3 text-xs text-muted flex items-center">Last Name</div>
            <div className="h-10 border border-border bg-white rounded px-3 text-xs text-muted flex items-center">Email</div>
            <div className="h-10 border border-border bg-white rounded px-3 text-xs text-muted flex items-center">Phone</div>
          </div>
          <div className="h-10 bg-gold text-white font-medium text-sm rounded flex items-center justify-center cursor-pointer">
            Request showing
          </div>
        </div>
      </div>
    </div>
  );
}
