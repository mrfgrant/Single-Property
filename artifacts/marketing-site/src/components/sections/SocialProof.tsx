import React from "react";
import { motion } from "framer-motion";
import { SOCIAL_PROOF } from "@/lib/copy";

export function SocialProof() {
  return (
    <section className="py-20 md:py-[5rem] px-6 lg:px-12 bg-ink text-warm-white">
      <div className="max-w-[1200px] mx-auto border-b border-[rgba(255,255,255,0.1)] pb-20">
        <div className="mb-16">
          <div className="text-gold font-serif font-bold text-6xl opacity-[0.03] absolute -translate-y-6 -translate-x-2 select-none">
            04
          </div>
          <h2 className="text-4xl md:text-5xl font-bold font-serif relative z-10 max-w-2xl leading-tight">
            {SOCIAL_PROOF.headline}
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {SOCIAL_PROOF.testimonials.map((t, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: index * 0.1 }}
              className="p-8 rounded bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.08)] flex flex-col"
            >
              <div className="flex gap-0.5 mb-5" aria-label="5 stars">
                {Array.from({ length: 5 }).map((_, i) => (
                  <svg key={i} width="13" height="13" viewBox="0 0 24 24" fill="currentColor" className="text-gold" aria-hidden>
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                  </svg>
                ))}
              </div>

              <p className="font-serif italic text-[0.9rem] text-warm-white/80 leading-relaxed mb-8 flex-1">
                "{t.quote}"
              </p>

              <div className="flex items-center gap-4 mt-auto">
                <div className="w-10 h-10 rounded-full bg-gold/20 text-gold flex items-center justify-center text-xs font-bold shrink-0">
                  {t.initials}
                </div>
                <div>
                  <div className="font-bold text-sm text-warm-white">{t.name}</div>
                  <div className="text-xs text-warm-white/50">{t.brokerage}</div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
