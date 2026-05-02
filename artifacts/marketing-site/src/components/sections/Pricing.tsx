import React from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { motion } from "framer-motion";
import { ONBOARDING_URL } from "@/lib/config";
import { track } from "@/lib/analytics";

export function Pricing() {
  const handleGetStarted = () => {
    track("cta_click", { label: "pricing_get_started" });
  };

  return (
    <section id="pricing" className="py-20 md:py-[5rem] px-6 lg:px-12 bg-cream border-b border-border">
      <div className="max-w-[1200px] mx-auto">
        <div className="mb-16">
          <div className="text-gold font-serif font-bold text-6xl opacity-10 absolute -translate-y-6 -translate-x-2 select-none">
            02
          </div>
          <h2 className="text-4xl md:text-5xl font-bold font-serif text-ink relative z-10">
            One price. Everything included.
          </h2>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="bg-ink rounded-lg p-8 md:p-12 text-warm-white flex flex-col h-full"
          >
            <div className="text-gold text-xs font-medium tracking-[0.15em] uppercase mb-6">
              PER ACTIVE LISTING
            </div>

            <div className="mb-8">
              <div className="font-serif font-bold text-[3.5rem] leading-none mb-2">
                $49
              </div>
              <div className="text-sm text-warm-white/70 font-light">
                per month &middot; auto-cancels when sold or withdrawn
              </div>
            </div>

            <ul className="space-y-4 mb-10 flex-1">
              {[
                "Custom street-address domain (412magnoliadrive.com)",
                "Full property website — MLS photos, map, school data, walk scores",
                "Instant email lead alerts (< 60 seconds)",
                "Automated seller weekly report — every Monday",
                "QR code + print-ready sign rider PDF",
                "Auto-archives + billing stops when listing closes",
              ].map((feature, i) => (
                <li key={i} className="flex gap-3 text-sm font-light text-warm-white/90">
                  <CheckCircle2 className="w-5 h-5 text-gold shrink-0 mt-0.5" />
                  <span className="leading-relaxed">{feature}</span>
                </li>
              ))}
            </ul>

            <a
              href={ONBOARDING_URL}
              onClick={handleGetStarted}
              className="w-full h-14 bg-gold text-white font-medium rounded hover:bg-gold-light transition-colors mt-auto text-base flex items-center justify-center"
            >
              Get started
            </a>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="border border-border rounded-lg p-8 md:p-12 bg-warm-white flex flex-col h-full"
          >
            <div className="text-ink text-sm font-bold tracking-wider mb-8">
              WHAT YOU DON'T PAY FOR
            </div>

            <ul className="space-y-6 mb-10 flex-1">
              {[
                { title: "No setup fees", desc: "Activate today, first charge when billing period starts" },
                { title: "No domain add-ons", desc: "Domain registration included. We handle it, you don't think about it." },
                { title: "No contracts", desc: "Cancel any time. Or don't — billing stops automatically at close." },
                { title: "No per-feature tiers", desc: 'Everything is included at $49. There is no "Pro" plan.' },
              ].map((item, i) => (
                <li key={i} className="flex gap-3">
                  <XCircle className="w-5 h-5 text-muted shrink-0 mt-0.5" />
                  <div>
                    <div className="text-ink font-bold text-sm mb-1">{item.title}</div>
                    <div className="text-muted text-sm font-light leading-relaxed">{item.desc}</div>
                  </div>
                </li>
              ))}
            </ul>

            <div className="bg-gold/10 border border-gold/20 rounded p-6 mt-auto">
              <p className="text-sm font-medium text-ink leading-relaxed">
                "3 active listings at once? That's $147/month total — and three sites, three domains, and three seller reports running with zero additional work from you."
              </p>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
