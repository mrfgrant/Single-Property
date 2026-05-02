import React, { useEffect } from "react";
import { Nav } from "@/components/sections/Nav";
import { Hero } from "@/components/sections/Hero";
import { HowItWorks } from "@/components/sections/HowItWorks";
import { Pricing } from "@/components/sections/Pricing";
import { ComparisonTable } from "@/components/sections/ComparisonTable";
import { SocialProof } from "@/components/sections/SocialProof";
import { DemoListings } from "@/components/sections/DemoListings";
import { CTABanner } from "@/components/sections/CTABanner";
import { Footer } from "@/components/sections/Footer";
import { initScrollDepth } from "@/lib/analytics";

export default function Home() {
  useEffect(() => {
    return initScrollDepth();
  }, []);

  return (
    <div className="min-h-[100dvh] bg-warm-white flex flex-col font-sans">
      <Nav />
      <main className="flex-1">
        <Hero />
        <HowItWorks />
        <Pricing />
        <ComparisonTable />
        <SocialProof />
        <DemoListings />
        <CTABanner />
      </main>
      <Footer />
    </div>
  );
}
