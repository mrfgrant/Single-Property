import React from "react";
import { CTA_BANNER } from "@/lib/copy";
import { ONBOARDING_URL, DEMO_EXAMPLE_URL } from "@/lib/config";
import { track } from "@/lib/analytics";

export function CTABanner() {
  return (
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
        <a
          href={DEMO_EXAMPLE_URL}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => track("see_example_click", { label: "banner" })}
          className="text-ink font-medium hover:text-gold transition-colors"
        >
          {CTA_BANNER.secondaryCta} &rarr;
        </a>
      </div>

      <div className="text-xs text-muted font-light">{CTA_BANNER.footnote}</div>
    </section>
  );
}
