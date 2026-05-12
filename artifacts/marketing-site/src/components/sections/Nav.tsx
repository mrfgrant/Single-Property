import React, { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";

import { ONBOARDING_URL } from "@/lib/config";
import { track } from "@/lib/analytics";
import { Menu, X } from "lucide-react";

export function Nav() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [location] = useLocation();
  const isHome = location === "/";

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollTo = (e: React.MouseEvent<HTMLAnchorElement>, targetId: string) => {
    e.preventDefault();
    setMobileMenuOpen(false);
    if (isHome) {
      document.getElementById(targetId)?.scrollIntoView({ behavior: "smooth" });
    } else {
      window.location.href = `/#${targetId}`;
    }
  };

  const handleGetStarted = () => {
    track("cta_click", { label: "nav_get_started" });
    setMobileMenuOpen(false);
  };

  const handleSeeExample = () => {
    track("see_example_click", { label: "nav" });
    setMobileMenuOpen(false);
  };

  return (
    <>
      <nav
        className={`fixed top-0 left-0 right-0 z-50 transition-colors duration-300 ${
          isScrolled ? "bg-warm-white border-b border-border" : "bg-transparent"
        }`}
      >
        <div className="max-w-[1200px] mx-auto px-6 lg:px-12 h-20 flex items-center justify-between">
          <Link href="/" className="flex flex-col leading-none">
            <img src="/propsite-logo.png" alt="PropSite" className="h-6 w-auto max-w-[110px]" />
            <span className="hidden sm:block font-mono text-[0.6rem] tracking-[0.12em] text-gold mt-1">
              CSRA's Property Site Engine · Est. 2026
            </span>
          </Link>

          <div className="hidden md:flex items-center gap-8">
            <a
              href="#how-it-works"
              onClick={(e) => scrollTo(e, "how-it-works")}
              className="text-sm font-medium text-ink hover:text-gold transition-colors"
            >
              How it works
            </a>
            <a
              href="#pricing"
              onClick={(e) => scrollTo(e, "pricing")}
              className="text-sm font-medium text-ink hover:text-gold transition-colors"
            >
              Pricing
            </a>
            <a
              href="#demo"
              onClick={(e) => { scrollTo(e, "demo"); handleSeeExample(); }}
              className="text-sm font-medium text-ink hover:text-gold transition-colors"
            >
              See examples
            </a>
            <a
              href={ONBOARDING_URL}
              onClick={handleGetStarted}
              className="h-11 px-6 bg-gold text-white font-semibold text-sm rounded-full flex items-center hover:bg-gold-light transition-colors shadow-sm"
            >
              Get started →
            </a>
          </div>

          <button
            className="md:hidden text-ink"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </nav>

      {mobileMenuOpen && (
        <div className="fixed inset-0 top-20 bg-warm-white z-40 flex flex-col p-6 border-t border-border md:hidden">
          <div className="flex flex-col gap-6">
            <a
              href="#how-it-works"
              onClick={(e) => scrollTo(e, "how-it-works")}
              className="text-lg font-medium text-ink"
            >
              How it works
            </a>
            <a
              href="#pricing"
              onClick={(e) => scrollTo(e, "pricing")}
              className="text-lg font-medium text-ink"
            >
              Pricing
            </a>
            <a
              href="#demo"
              onClick={(e) => {
                scrollTo(e, "demo");
                handleSeeExample();
              }}
              className="text-lg font-medium text-ink"
            >
              See examples
            </a>
            <a
              href={ONBOARDING_URL}
              onClick={handleGetStarted}
              className="h-14 px-6 bg-gold text-white font-semibold text-base rounded-full flex items-center justify-center mt-4"
            >
              Get started — $49/mo
            </a>
          </div>
        </div>
      )}
    </>
  );
}
