import React, { useEffect, useState } from "react";
import { MapPin, X } from "lucide-react";

const SESSION_KEY = "propsite_geo_check";

export function OomBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const stored = sessionStorage.getItem(SESSION_KEY);
    if (stored === "in-market") return;
    if (stored === "out-of-market") { setShow(true); return; }

    fetch("https://ipapi.co/json/", {
      signal: AbortSignal.timeout(6000),
    })
      .then((r) => r.json())
      .then((data: { region_code?: string; country_code?: string }) => {
        const inMarket =
          data.country_code === "US" &&
          (data.region_code === "GA" || data.region_code === "SC");
        sessionStorage.setItem(SESSION_KEY, inMarket ? "in-market" : "out-of-market");
        if (!inMarket) setShow(true);
      })
      .catch(() => {});
  }, []);

  if (!show) return null;

  const scrollToWaitlist = (e: React.MouseEvent) => {
    e.preventDefault();
    document.getElementById("waitlist")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="bg-ink text-warm-white text-sm px-4 py-2.5 flex items-center justify-center gap-3">
      <MapPin size={14} className="text-gold shrink-0" />
      <span className="text-center">
        PropSite currently serves{" "}
        <strong className="font-semibold">Augusta, GA / CSRA</strong> agents.{" "}
        <a
          href="#waitlist"
          onClick={scrollToWaitlist}
          className="underline text-gold hover:text-gold/80 transition-colors font-medium"
        >
          Join the waitlist for your market →
        </a>
      </span>
      <button
        onClick={() => setShow(false)}
        className="ml-1 text-white/50 hover:text-white transition-colors shrink-0"
        aria-label="Dismiss"
      >
        <X size={14} />
      </button>
    </div>
  );
}
