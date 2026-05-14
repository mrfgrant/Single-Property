import React, { useEffect, useRef, useState } from "react";
import { Nav } from "@/components/sections/Nav";
import { Hero } from "@/components/sections/Hero";
import { HowItWorks } from "@/components/sections/HowItWorks";
import { AgentControl } from "@/components/sections/AgentControl";
import { Pricing } from "@/components/sections/Pricing";
import { ComparisonTable } from "@/components/sections/ComparisonTable";
import { FAQSection } from "@/components/sections/FAQ";
import { SocialProof } from "@/components/sections/SocialProof";
import { DemoListings } from "@/components/sections/DemoListings";
import { CTABanner } from "@/components/sections/CTABanner";
import { Footer } from "@/components/sections/Footer";
import { OomBanner, useOomBanner } from "@/components/OomBanner";
import { initScrollDepth } from "@/lib/analytics";
import { applySeoFromCopy } from "@/lib/seo";

export default function Home() {
  const { show: bannerShow, dismiss: bannerDismiss } = useOomBanner();
  const headerRef = useRef<HTMLDivElement>(null);
  // Start at 80 (nav bar height) so there's no layout shift on first paint
  const [headerHeight, setHeaderHeight] = useState(80);

  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const measure = () => setHeaderHeight(el.offsetHeight);
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    applySeoFromCopy();
    return initScrollDepth();
  }, []);

  return (
    <div className="min-h-[100dvh] bg-warm-white flex flex-col font-sans">
      {/* Single fixed column: banner (conditional) + nav bar stacked vertically */}
      <div ref={headerRef} className="fixed top-0 left-0 right-0 z-50 flex flex-col">
        <OomBanner show={bannerShow} onClose={bannerDismiss} />
        <Nav embedded fixedHeaderHeight={headerHeight} />
      </div>

      {/* Push page content below the combined fixed header */}
      <main className="flex-1" style={{ paddingTop: headerHeight }}>
        <Hero />
        <HowItWorks />
        <AgentControl />
        <Pricing />
        <ComparisonTable />
        <FAQSection />
        <SocialProof />
        <DemoListings />
        <CTABanner />
      </main>
      <Footer />
    </div>
  );
}
