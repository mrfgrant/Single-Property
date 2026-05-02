import React, { useState } from "react";
import { Link } from "wouter";
import { CTA_BANNER } from "@/lib/copy";
import { ONBOARDING_URL, REGION } from "@/lib/config";
import { track } from "@/lib/analytics";

const API_BASE = import.meta.env.VITE_API_URL ?? "";

function WaitlistBlock() {
  const [form, setForm] = useState({ firstName: "", email: "", mlsBoardName: "" });
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("loading");
    try {
      const res = await fetch(`${API_BASE}/api/waitlist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, source: "marketing_site" }),
      });
      if (res.ok) {
        setStatus("success");
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  };

  if (status === "success") {
    return (
      <div className="text-center py-6">
        <p className="text-lg font-serif font-semibold text-ink mb-1">You're on the list.</p>
        <p className="text-sm text-muted">We'll reach out the moment we expand to your market.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3 max-w-xl mx-auto">
      <input
        required
        placeholder="First name"
        value={form.firstName}
        onChange={(e) => setForm({ ...form, firstName: e.target.value })}
        className="flex-1 h-11 px-4 rounded border border-border text-sm bg-warm-white focus:outline-none focus:border-ink"
      />
      <input
        required
        type="email"
        placeholder="Your email"
        value={form.email}
        onChange={(e) => setForm({ ...form, email: e.target.value })}
        className="flex-1 h-11 px-4 rounded border border-border text-sm bg-warm-white focus:outline-none focus:border-ink"
      />
      <input
        placeholder="MLS board name"
        value={form.mlsBoardName}
        onChange={(e) => setForm({ ...form, mlsBoardName: e.target.value })}
        className="flex-1 h-11 px-4 rounded border border-border text-sm bg-warm-white focus:outline-none focus:border-ink"
      />
      <button
        type="submit"
        disabled={status === "loading"}
        className="h-11 px-6 bg-ink text-warm-white text-sm font-medium rounded hover:bg-ink/90 transition-colors disabled:opacity-60 whitespace-nowrap"
      >
        {status === "loading" ? "Joining…" : "Join waitlist"}
      </button>
    </form>
  );
}

export function CTABanner() {
  return (
    <>
      <section className="py-24 px-6 text-center max-w-[800px] mx-auto">
        <h2 className="text-4xl md:text-[3rem] leading-tight font-bold font-serif text-ink mb-6">
          {CTA_BANNER.headline[0]}{" "}
          <em className="italic text-gold">{CTA_BANNER.headline[1]}</em>
        </h2>

        <p className="text-lg text-muted font-light mb-12">{CTA_BANNER.subhead}</p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-6 mb-8">
          <a
            href={ONBOARDING_URL}
            onClick={() => track("cta_click", { label: "banner_get_started" })}
            className="w-full sm:w-auto h-14 px-10 bg-ink text-warm-white font-medium text-base rounded flex items-center justify-center hover:bg-ink/90 transition-colors"
          >
            {CTA_BANNER.primaryCta}
          </a>
          <Link
            href="/listing/412-walton-way-augusta-ga"
            onClick={() => track("see_example_click", { label: "banner" })}
            className="text-ink font-medium hover:text-gold transition-colors"
          >
            {CTA_BANNER.secondaryCta} &rarr;
          </Link>
        </div>

        <div className="text-xs text-muted font-light">{CTA_BANNER.footnote}</div>
      </section>

      {/* Out-of-market waitlist block */}
      <section id="waitlist" className="py-16 px-6 bg-cream border-t border-border">
        <div className="max-w-[700px] mx-auto text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-gold mb-3">
            Not in {REGION.marketName}?
          </p>
          <h3 className="text-2xl font-serif font-bold text-ink mb-3">
            We're launching market by market.
          </h3>
          <p className="text-muted text-sm mb-8 max-w-md mx-auto">
            Right now we serve agents in {REGION.marketName}. Drop your info below and you'll be first to know when we expand to your area.
          </p>
          <WaitlistBlock />
        </div>
      </section>
    </>
  );
}
