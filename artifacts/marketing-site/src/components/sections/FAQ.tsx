import React from "react";
import { motion } from "framer-motion";
import { FAQ } from "@/lib/copy";

export function FAQSection() {
  return (
    <section className="py-20 md:py-[5rem] px-6 lg:px-12 bg-warm-white border-b border-border">
      <div className="max-w-[1200px] mx-auto">
        <div className="mb-16">
          <div className="text-gold text-xs font-medium tracking-[0.15em] uppercase mb-4">
            {FAQ.eyebrow}
          </div>
          <h2 className="text-4xl md:text-5xl font-bold font-serif text-ink max-w-2xl leading-tight">
            {FAQ.headline}
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-16 gap-y-10">
          {FAQ.items.map((item, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.07 }}
            >
              <div className="flex gap-3 mb-3">
                <span className="text-gold font-serif font-bold text-lg leading-none mt-0.5 shrink-0">Q</span>
                <p className="font-bold text-ink text-[0.95rem] leading-snug">{item.q}</p>
              </div>
              <p className="text-muted text-sm font-light leading-relaxed pl-7">{item.a}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
