import React from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { motion } from "framer-motion";
import { PRICING } from "@/lib/copy";
import { ONBOARDING_URL } from "@/lib/config";
import { track } from "@/lib/analytics";

export function Pricing() {
  return (
    <section id="pricing" className="py-20 md:py-[5rem] px-6 lg:px-12 bg-cream border-b border-border">
      <div className="max-w-[1200px] mx-auto">
        <div className="mb-16">
          <div className="text-gold font-serif font-bold text-6xl opacity-10 absolute -translate-y-6 -translate-x-2 select-none">
            02
          </div>
          <h2 className="text-4xl md:text-5xl font-bold font-serif text-ink relative z-10">
            {PRICING.headline}
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
              {PRICING.eyebrow}
            </div>

            <div className="mb-8">
              <div className="font-serif font-bold text-[3.5rem] leading-none mb-2">
                {PRICING.price}
              </div>
              <div className="text-sm text-warm-white/70 font-light">
                {PRICING.priceSuffix}
              </div>
            </div>

            <ul className="space-y-4 mb-10 flex-1">
              {PRICING.features.map((feature, i) => (
                <li key={i} className="flex gap-3 text-sm font-light text-warm-white/90">
                  <CheckCircle2 className="w-5 h-5 text-gold shrink-0 mt-0.5" />
                  <span className="leading-relaxed">{feature}</span>
                </li>
              ))}
            </ul>

            <a
              href={ONBOARDING_URL}
              onClick={() => track("cta_click", { label: "pricing_get_started" })}
              className="w-full h-14 bg-gold text-white font-medium rounded hover:bg-gold-light transition-colors mt-auto text-base flex items-center justify-center"
            >
              {PRICING.cta}
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
              {PRICING.noCharges.map((item, i) => (
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
                {PRICING.pullQuote}
              </p>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
