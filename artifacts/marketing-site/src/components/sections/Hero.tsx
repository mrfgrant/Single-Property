import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { MockBrowser } from "@/components/MockBrowser";
import { HERO } from "@/lib/copy";
import { ONBOARDING_URL, DEMO_EXAMPLE_URL } from "@/lib/config";
import { track } from "@/lib/analytics";
import { fetchFeaturedListing, type PublicListing } from "@/lib/publicListings";

export function Hero() {
  const [featured, setFeatured] = useState<PublicListing | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchFeaturedListing().then((l) => {
      if (!cancelled) setFeatured(l);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const exampleHref = featured ? `/listing/${featured.slug}` : DEMO_EXAMPLE_URL;

  return (
    <section className="min-h-[88vh] pt-12 pb-16 border-b border-border flex items-center">
      <div className="max-w-[1200px] mx-auto px-6 lg:px-12 w-full grid grid-cols-1 lg:grid-cols-2">
        <div className="flex flex-col justify-center py-12 lg:pr-12 lg:border-r border-border">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="inline-flex items-center px-2 py-0.5 rounded-[2px] bg-[rgba(201,168,76,0.1)] border border-[rgba(201,168,76,0.3)] mb-8">
              <span className="text-[0.7rem] uppercase tracking-[0.15em] text-gold font-medium">
                {HERO.eyebrow}
              </span>
            </div>

            <h1 className="font-serif text-5xl md:text-[4.25rem] leading-[1.05] font-semibold text-ink mb-6 tracking-tight">
              {HERO.headline[0]}
              <br />
              {HERO.headline[1]}{" "}
              <em className="text-gold italic font-medium">{HERO.headline[2]}</em>
            </h1>

            <p className="text-lg md:text-xl font-light text-muted leading-relaxed max-w-[480px] mb-10">
              {HERO.subhead}
            </p>

            <div className="flex flex-col sm:flex-row items-center gap-6 mb-16">
              <a
                href={ONBOARDING_URL}
                onClick={() => track("cta_click", { label: "hero_get_started" })}
                className="w-full sm:w-auto h-14 px-8 bg-gold text-white font-semibold text-base rounded-full flex items-center justify-center hover:bg-gold-light transition-colors shadow-md"
              >
                {HERO.primaryCta}
              </a>
              <a
                href={exampleHref}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => track("see_example_click", { label: "hero" })}
                className="text-ink font-medium hover:text-gold transition-colors"
              >
                {HERO.secondaryCta} &rarr;
              </a>
            </div>

            <div className="border-t border-border pt-8 grid grid-cols-3 gap-4">
              {HERO.stats.map((stat) => (
                <div key={stat.label}>
                  <div className="font-serif font-bold text-2xl md:text-[1.75rem] text-ink mb-1">
                    {stat.value}
                  </div>
                  <div className="text-[0.75rem] text-muted font-medium uppercase tracking-wider">
                    {stat.label}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        </div>

        <div className="bg-ink flex items-center justify-center py-12 lg:py-0 px-6 rounded-lg lg:rounded-none lg:rounded-r-xl overflow-hidden mt-12 lg:mt-0">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="w-full"
          >
            <MockBrowser listing={featured} />
          </motion.div>
        </div>
      </div>
    </section>
  );
}
