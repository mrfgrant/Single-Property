import React from "react";
import { motion } from "framer-motion";
import type { PublicListing } from "@/lib/publicListings";

interface Props {
  listing?: PublicListing | null;
}

function fmtPrice(n: number): string {
  return `$${n.toLocaleString()}`;
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
    zip: "30909",
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
  const cityState = `${data.city}, ${data.state}`.toUpperCase();
  const addressLine = data.address.toUpperCase();

  return (
    <div className="w-full max-w-[600px] mx-auto rounded-[6px] border border-[rgba(255,255,255,0.1)] bg-ink overflow-hidden flex flex-col font-sans text-left shadow-2xl">
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

      {/* HERO — full-bleed, editorial overlay (mirrors /listing/:slug template) */}
      <div className="relative bg-warm-white">
        {/* Mini menu rail */}
        <div className="absolute top-0 left-0 z-10 h-full w-7 md:w-9 bg-ink text-warm-white flex flex-col items-center justify-between py-3 md:py-4">
          <div className="flex flex-col gap-[3px]">
            <span className="block w-3 h-px bg-warm-white" />
            <span className="block w-3 h-px bg-warm-white" />
            <span className="block w-3 h-px bg-warm-white" />
          </div>
          <span
            className="text-[7px] md:text-[8px] tracking-[0.5em] uppercase font-medium leading-none"
            style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
          >
            Menu
          </span>
          <span className="block w-1 h-1 rounded-full bg-gold" />
        </div>

        {/* Photo */}
        <div
          className="relative h-[280px] md:h-[360px] pl-7 md:pl-9"
          style={
            heroPhoto
              ? {
                  backgroundImage: `linear-gradient(to bottom, rgba(10,30,58,0.20) 0%, rgba(10,30,58,0) 35%, rgba(10,30,58,0) 60%, rgba(10,30,58,0.65) 100%), url(${heroPhoto})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }
              : { background: "linear-gradient(135deg, #0a1e3a 0%, #1a3358 60%, #2d4a78 100%)" }
          }
        >
          {/* Top bar — domain + tour pill */}
          <div className="absolute top-0 inset-x-0 pl-7 md:pl-9 px-4 md:px-6 py-3 md:py-4 flex items-start justify-between gap-3 text-warm-white">
            <span className="font-serif text-xs md:text-sm tracking-tight drop-shadow-md truncate max-w-[60%]">
              {deriveDomain(data as PublicListing)}
            </span>
            <span className="border border-warm-white/80 text-warm-white text-[8px] md:text-[9px] uppercase tracking-[0.3em] px-2.5 md:px-3 py-1 md:py-1.5 backdrop-blur-sm">
              Schedule a Tour
            </span>
          </div>

          {/* Bottom overlay — price + address + open house */}
          <div className="absolute bottom-0 inset-x-0 pl-7 md:pl-9 px-4 md:px-6 pb-4 md:pb-5 flex items-end justify-between gap-3 text-warm-white">
            <div className="min-w-0">
              <p className="font-serif text-3xl md:text-5xl leading-none drop-shadow-lg">
                {fmtPrice(data.price)}
              </p>
              <p className="text-[8px] md:text-[10px] uppercase tracking-[0.3em] mt-1.5 md:mt-2 text-warm-white/80">
                {data.beds} Bed · {data.baths} Bath · {data.sqft.toLocaleString()} Sq Ft
              </p>
              <p className="font-serif text-sm md:text-base mt-2 md:mt-3 tracking-wide drop-shadow-md truncate">
                {addressLine}
              </p>
              <p className="text-[8px] md:text-[10px] uppercase tracking-[0.3em] mt-0.5 text-warm-white/80">
                {cityState}
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="font-serif text-sm md:text-lg drop-shadow-md leading-none">
                Open House
              </p>
              <p className="text-[8px] md:text-[9px] uppercase tracking-[0.3em] mt-1 text-warm-white/80">
                By appointment
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Editorial story strip + tiny lead bar (mirrors page below the fold) */}
      <div className="bg-warm-white pl-7 md:pl-9">
        <div className="px-5 md:px-6 py-6 md:py-8 text-center border-b border-ink/10">
          <p className="text-[8px] md:text-[9px] uppercase tracking-[0.4em] text-gold mb-2">
            The Home
          </p>
          <h3 className="font-serif text-lg md:text-2xl text-ink leading-snug mb-2">
            A timeless {data.beds}-bed retreat in {data.city}.
          </h3>
          <p className="text-[11px] md:text-xs text-muted/90 italic">
            Walk {data.walkScore} · Schools {data.schoolRating}/10 · Built to last.
          </p>
        </div>

        {/* Mini schedule bar */}
        <div className="px-5 md:px-6 py-4 md:py-5 bg-ink text-warm-white flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[8px] md:text-[9px] uppercase tracking-[0.3em] text-warm-white/60">
              Schedule
            </p>
            <p className="font-serif text-sm md:text-base leading-tight mt-0.5 truncate">
              Come see it in person
            </p>
          </div>
          <span className="shrink-0 bg-gold text-ink text-[9px] md:text-[10px] uppercase tracking-[0.25em] font-semibold px-3 md:px-4 py-2 md:py-2.5">
            Request Showing
          </span>
        </div>
      </div>
    </div>
  );
}
