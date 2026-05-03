import React from "react";
import { motion } from "framer-motion";

export function MockBrowser() {
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
          2918arrowheaddrive.com
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
      <div className="relative h-[240px] md:h-[300px] bg-gradient-to-b from-[#1b3b36] to-[#0f2420] p-6 flex flex-col justify-end">
        {/* Price Tag */}
        <div className="absolute top-6 left-6 px-4 py-1.5 rounded-full bg-gold text-white font-serif font-bold text-lg">
          $185,000
        </div>

        {/* Address */}
        <div className="mt-auto">
          <h2 className="text-white font-serif text-3xl md:text-4xl leading-tight font-bold mb-2">
            2918 Arrowhead Drive,<br />
            Augusta GA
          </h2>
          <div className="flex flex-wrap items-center gap-2 text-sm text-[rgba(255,255,255,0.8)] font-light">
            <span>3 bed</span>
            <span>&middot;</span>
            <span>3 bath</span>
            <span>&middot;</span>
            <span>1,836 sqft</span>
            <span>&middot;</span>
            <span>0.11 acre lot</span>
          </div>
        </div>
      </div>

      {/* Content Area */}
      <div className="p-6 bg-white">
        {/* Neighborhood Scores */}
        <div className="flex flex-wrap gap-2 mb-8">
          <span className="px-3 py-1 bg-cream text-ink text-xs font-medium rounded-full border border-border">Walk 80</span>
          <span className="px-3 py-1 bg-cream text-ink text-xs font-medium rounded-full border border-border">Bike 60</span>
          <span className="px-3 py-1 bg-cream text-ink text-xs font-medium rounded-full border border-border">Schools 10/10</span>
          <span className="px-3 py-1 bg-cream text-ink text-xs font-medium rounded-full border border-border">Transit 35</span>
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
