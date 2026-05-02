import React from "react";
import { PLATFORM_NAME, COMPARISON } from "@/lib/copy";

export function ComparisonTable() {
  const { headline, rows } = COMPARISON;

  return (
    <section className="py-20 md:py-[5rem] px-6 lg:px-12 max-w-[1200px] mx-auto border-b border-border">
      <div className="mb-12">
        <div className="text-gold font-serif font-bold text-6xl opacity-10 absolute -translate-y-6 -translate-x-2 select-none">
          03
        </div>
        <h2 className="text-4xl md:text-5xl font-bold font-serif text-ink relative z-10">
          {headline}
        </h2>
      </div>

      <div className="overflow-x-auto pb-4">
        <table className="w-full min-w-[800px] text-left border-collapse">
          <thead>
            <tr>
              <th className="py-4 px-4 font-medium text-muted text-sm border-b border-border w-1/4">Feature</th>
              <th className="py-4 px-4 font-bold text-gold text-lg border-b-2 border-gold w-1/4 bg-gold/5 rounded-t-sm">{PLATFORM_NAME}</th>
              <th className="py-4 px-4 font-medium text-ink text-sm border-b border-border w-1/6">Rela</th>
              <th className="py-4 px-4 font-medium text-ink text-sm border-b border-border w-1/6">CribFlyer</th>
              <th className="py-4 px-4 font-medium text-ink text-sm border-b border-border w-1/6">PhotoUp</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index} className="group hover:bg-ink/[0.02] transition-colors border-b border-border last:border-b-0">
                <td className="py-5 px-4 text-sm font-medium text-ink">{row.feature}</td>
                <td className="py-5 px-4 text-sm font-bold text-ink bg-gold/5">
                  <span className={row.propsite.includes("✓") ? "text-[#28a865]" : ""}>
                    {row.propsite.replace("✓", "").trim() ? (
                      <>
                        {row.propsite.includes("✓") && <span className="mr-1">✓</span>}
                        <span className="text-ink">{row.propsite.replace("✓", "").trim()}</span>
                      </>
                    ) : (
                      "✓"
                    )}
                  </span>
                </td>
                <td className="py-5 px-4 text-sm font-light text-muted">
                  <span className={row.rela === "✓" ? "text-[#28a865] font-bold" : ""}>{row.rela}</span>
                </td>
                <td className="py-5 px-4 text-sm font-light text-muted">
                  <span className={row.cribflyer === "✓" ? "text-[#28a865] font-bold" : ""}>{row.cribflyer}</span>
                </td>
                <td className="py-5 px-4 text-sm font-light text-muted">
                  <span className={row.photoup === "✓" ? "text-[#28a865] font-bold" : ""}>{row.photoup}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
