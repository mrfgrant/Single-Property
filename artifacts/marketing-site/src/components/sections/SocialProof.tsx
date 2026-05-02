import React from "react";
import { motion } from "framer-motion";

const testimonials = [
  {
    quote: "I got a text saying my new listing's site was live. I hadn't even finished writing the MLS description yet. That's when I realized this thing actually works.",
    initials: "SR",
    name: "Sarah R.",
    brokerage: "Keller Williams · Augusta, GA"
  },
  {
    quote: "My sellers ask me every single listing 'how are people finding out about the house?' Now I just forward them the Monday report. They're always impressed.",
    initials: "DM",
    name: "David M.",
    brokerage: "RE/MAX · Columbia, SC"
  },
  {
    quote: "I was skeptical, but the site it built for my Walton Way listing was better than anything I would have made myself. And it had a showing request within 48 hours.",
    initials: "TL",
    name: "Tracy L.",
    brokerage: "Meybohm Real Estate · CSRA"
  }
];

export function SocialProof() {
  return (
    <section className="py-20 md:py-[5rem] px-6 lg:px-12 bg-ink text-warm-white">
      <div className="max-w-[1200px] mx-auto border-b border-[rgba(255,255,255,0.1)] pb-20">
        <div className="mb-16">
          <div className="text-gold font-serif font-bold text-6xl opacity-[0.03] absolute -translate-y-6 -translate-x-2 select-none">
            04
          </div>
          <h2 className="text-4xl md:text-5xl font-bold font-serif relative z-10 max-w-2xl leading-tight">
            Agents love never thinking about this again.
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {testimonials.map((t, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: index * 0.1 }}
              className="p-8 rounded bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.08)] flex flex-col"
            >
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
