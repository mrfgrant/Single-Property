import React from "react";
import { Nav } from "@/components/sections/Nav";
import { Hero } from "@/components/sections/Hero";
import { HowItWorks } from "@/components/sections/HowItWorks";
import { Pricing } from "@/components/sections/Pricing";
import { ComparisonTable } from "@/components/sections/ComparisonTable";
import { SocialProof } from "@/components/sections/SocialProof";
import { CTABanner } from "@/components/sections/CTABanner";
import { Footer } from "@/components/sections/Footer";

export default function Home() {
  return (
    <div className="min-h-[100dvh] bg-warm-white flex flex-col font-sans">
      <Nav />
      <main className="flex-1">
        <Hero />
        <HowItWorks />
        <Pricing />
        <ComparisonTable />
        <SocialProof />
        <CTABanner />
      </main>
      <Footer />
    </div>
  );
}
