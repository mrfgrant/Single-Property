import React from "react";
import { motion } from "framer-motion";
import { HOW_IT_WORKS } from "@/lib/copy";

export function HowItWorks() {
  const steps = HOW_IT_WORKS.steps;

  return (
    <section id="how-it-works" className="py-20 md:py-[5rem] px-6 lg:px-12 max-w-[1200px] mx-auto border-b border-border">
      <div className="mb-16">
        <div className="text-gold font-serif font-bold text-6xl opacity-10 absolute -translate-y-6 -translate-x-2 select-none">
          01
        </div>
        <h2 className="text-4xl md:text-5xl font-bold font-serif text-ink relative z-10">
          {HOW_IT_WORKS.headline}
        </h2>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 border border-border rounded-lg overflow-hidden">
        {steps.map((step, index) => (
          <motion.div
            key={step.num}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.6, delay: index * 0.1 }}
            className={`p-8 relative ${
              index !== steps.length - 1 ? "border-b sm:border-b-0 sm:border-r border-border" : ""
            } ${index === 1 ? "sm:border-b lg:border-b-0" : ""}`}
          >
            <div className="absolute top-4 right-6 text-ink/5 font-serif font-bold text-8xl select-none leading-none">
              {step.num}
            </div>

            <div className="w-8 h-8 rounded-full bg-ink flex items-center justify-center mb-6 relative z-10">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            </div>

            <h3 className="font-serif font-bold text-xl text-ink mb-3 relative z-10 pr-4">
              {step.title}
            </h3>

            <p className="text-sm font-light text-muted leading-relaxed mb-6 relative z-10">
              {step.body}
            </p>

            <div className="inline-flex items-center px-3 py-1 rounded-full bg-gold/10 text-gold text-xs font-medium relative z-10">
              {step.badge}
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
