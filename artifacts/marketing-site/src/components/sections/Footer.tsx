import React from "react";
import { PLATFORM_NAME } from "@/lib/copy";
import { REGION } from "@/lib/config";

export function Footer() {
  const scrollToWaitlist = (e: React.MouseEvent) => {
    e.preventDefault();
    document.getElementById("waitlist")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <footer className="border-t border-border bg-warm-white py-12 px-6 lg:px-12">
      <div className="max-w-[1200px] mx-auto">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6 mb-6">
          <div className="flex flex-col leading-none">
            <img src="/propsite-logo.png" alt="PropSite" className="h-6 w-auto" />
            <span className="font-mono text-[0.6rem] tracking-[0.12em] text-gold mt-1">
              CSRA's Property Site Engine · Est. 2026
            </span>
          </div>

          <div className="text-sm text-muted font-light">
            &copy; {new Date().getFullYear()} {PLATFORM_NAME}. All rights reserved.
          </div>

          <div className="flex items-center gap-6 text-sm font-medium text-ink">
            <a href="/privacy" className="hover:text-gold transition-colors">Privacy</a>
            <a href="/terms" className="hover:text-gold transition-colors">Terms</a>
            <a href="/support" className="hover:text-gold transition-colors">Support</a>
          </div>
        </div>

        <div className="border-t border-border/60 pt-5 text-center text-xs text-muted font-light">
          Currently serving agents in{" "}
          <strong className="font-medium text-ink">{REGION.marketName}</strong>
          {" "}—{" "}
          <a
            href={REGION.mlsBoardUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-gold transition-colors"
          >
            {REGION.mlsBoardName}
          </a>
          .{" "}
          <a
            href="#waitlist"
            onClick={scrollToWaitlist}
            className="text-gold hover:underline font-medium"
          >
            Notify me when you reach my market →
          </a>
        </div>
      </div>
    </footer>
  );
}
