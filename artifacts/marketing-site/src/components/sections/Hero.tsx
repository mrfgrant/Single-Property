import React from "react";
import { motion } from "framer-motion";
import { MockBrowser } from "@/components/MockBrowser";
import { ONBOARDING_URL, DEMO_EXAMPLE_URL } from "@/lib/config";
import { track } from "@/lib/analytics";

export function Hero() {
  return (
    <section className="min-h-[88vh] pt-32 pb-16 border-b border-border flex items-center">
      <div className="max-w-[1200px] mx-auto px-6 lg:px-12 w-full grid grid-cols-1 lg:grid-cols-2">
        <div className="flex flex-col justify-center py-12 lg:pr-12 lg:border-r border-border">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="inline-flex items-center px-2 py-0.5 rounded-[2px] bg-[rgba(201,168,76,0.1)] border border-[rgba(201,168,76,0.3)] mb-8">
              <span className="text-[0.7rem] uppercase tracking-[0.15em] text-gold font-medium">
                FOR REAL ESTATE AGENTS
              </span>
            </div>

            <h1 className="text-5xl md:text-[4rem] leading-[1.1] font-bold text-ink mb-6">
              Your listing gets a site.
              <br />
              Without you lifting
              <br />
              <em className="text-gold font-serif italic">a finger.</em>
            </h1>

            <p className="text-lg md:text-xl font-light text-muted leading-relaxed max-w-[480px] mb-10">
              We watch your MLS feed. The moment a new listing appears
              under your name, we build the full marketing site, register
              the domain, and start collecting leads — automatically.
            </p>

            <div className="flex flex-col sm:flex-row items-center gap-6 mb-16">
              <a
                href={ONBOARDING_URL}
                onClick={() => track("cta_click", { label: "hero_get_started" })}
                className="w-full sm:w-auto h-14 px-8 bg-ink text-warm-white font-medium text-base rounded flex items-center justify-center hover:bg-ink/90 transition-colors"
              >
                Start for $49 / listing
              </a>
              <a
                href={DEMO_EXAMPLE_URL}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => track("see_example_click", { label: "hero" })}
                className="text-ink font-medium hover:text-gold transition-colors"
              >
                See a live example &rarr;
              </a>
            </div>

            <div className="border-t border-border pt-8 grid grid-cols-3 gap-4">
              <div>
                <div className="font-serif font-bold text-2xl md:text-[1.75rem] text-ink mb-1">
                  &lt; 5 min
                </div>
                <div className="text-[0.75rem] text-muted font-medium uppercase tracking-wider">
                  MLS to live site
                </div>
              </div>
              <div>
                <div className="font-serif font-bold text-2xl md:text-[1.75rem] text-ink mb-1">
                  90 sec
                </div>
                <div className="text-[0.75rem] text-muted font-medium uppercase tracking-wider">
                  One-time setup
                </div>
              </div>
              <div>
                <div className="font-serif font-bold text-2xl md:text-[1.75rem] text-ink mb-1">
                  $0
                </div>
                <div className="text-[0.75rem] text-muted font-medium uppercase tracking-wider">
                  Per-listing effort
                </div>
              </div>
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
            <MockBrowser />
          </motion.div>
        </div>
      </div>
    </section>
  );
}
