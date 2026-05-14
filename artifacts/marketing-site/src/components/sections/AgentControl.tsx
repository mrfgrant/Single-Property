import React from "react";
import { motion } from "framer-motion";
import { AGENT_CONTROL } from "@/lib/copy";

function Check({ color = "gold" }: { color?: "gold" | "ink" }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={color === "gold" ? "text-gold shrink-0 mt-0.5" : "text-ink/40 shrink-0 mt-0.5"}
      aria-hidden
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export function AgentControl() {
  return (
    <section className="py-20 md:py-[5rem] px-6 lg:px-12 bg-cream border-b border-border">
      <div className="max-w-[1200px] mx-auto">
        <div className="mb-14">
          <div className="text-gold text-xs font-medium tracking-[0.15em] uppercase mb-4">
            {AGENT_CONTROL.eyebrow}
          </div>
          <h2 className="text-4xl md:text-5xl font-bold font-serif text-ink max-w-2xl leading-tight mb-4">
            {AGENT_CONTROL.headline}
          </h2>
          <p className="text-muted font-light text-base max-w-xl leading-relaxed">
            {AGENT_CONTROL.subhead}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="rounded-lg border border-gold/30 bg-white p-8"
          >
            <div className="flex items-center gap-2 mb-6">
              <span className="w-2 h-2 rounded-full bg-gold" aria-hidden />
              <span className="text-xs font-semibold tracking-[0.15em] uppercase text-gold">
                {AGENT_CONTROL.yoursLabel}
              </span>
            </div>
            <ul className="space-y-4">
              {AGENT_CONTROL.yours.map((item, i) => (
                <li key={i} className="flex items-start gap-3">
                  <Check color="gold" />
                  <span className="text-sm text-ink leading-snug">{item}</span>
                </li>
              ))}
            </ul>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="rounded-lg border border-border bg-warm-white p-8"
          >
            <div className="flex items-center gap-2 mb-6">
              <span className="w-2 h-2 rounded-full bg-ink/20" aria-hidden />
              <span className="text-xs font-semibold tracking-[0.15em] uppercase text-muted">
                {AGENT_CONTROL.oursLabel}
              </span>
            </div>
            <ul className="space-y-4">
              {AGENT_CONTROL.ours.map((item, i) => (
                <li key={i} className="flex items-start gap-3">
                  <Check color="ink" />
                  <span className="text-sm text-muted leading-snug">{item}</span>
                </li>
              ))}
            </ul>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
