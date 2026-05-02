import React from "react";
import { ONBOARDING_URL, DEMO_EXAMPLE_URL } from "@/lib/config";
import { track } from "@/lib/analytics";

export function CTABanner() {
  const handleGetStarted = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    track("cta_click", { label: "banner_get_started" });
    document.getElementById("pricing")?.scrollIntoView({ behavior: "smooth" });
  };

  const handleSeeExample = () => {
    track("see_example_click", { label: "banner" });
  };

  return (
    <section className="py-24 px-6 text-center max-w-[800px] mx-auto">
      <h2 className="text-4xl md:text-[3rem] leading-tight font-bold font-serif text-ink mb-6">
        Your next listing deserves a{" "}
        <em className="italic text-gold">proper website.</em>
      </h2>

      <p className="text-lg text-muted font-light mb-12">
        Set up once in 90 seconds. Every listing after that is automatic.
      </p>

      <div className="flex flex-col sm:flex-row items-center justify-center gap-6 mb-8">
        <a
          href={ONBOARDING_URL}
          onClick={handleGetStarted}
          className="w-full sm:w-auto h-14 px-10 bg-ink text-warm-white font-medium text-base rounded flex items-center justify-center hover:bg-ink/90 transition-colors"
        >
          Get started — $49 / listing
        </a>
        <a
          href={DEMO_EXAMPLE_URL}
          target="_blank"
          rel="noopener noreferrer"
          onClick={handleSeeExample}
          className="text-ink font-medium hover:text-gold transition-colors"
        >
          See a live example &rarr;
        </a>
      </div>

      <div className="text-xs text-muted font-light">
        No setup fees &middot; No contracts &middot; Billing stops automatically when your listing closes
      </div>
    </section>
  );
}
