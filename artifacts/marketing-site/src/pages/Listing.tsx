import React, { Suspense, lazy, useEffect, useRef, useState } from "react";
import { Link, useParams } from "wouter";
import { getListingBySlug, formatPrice, type SampleListing } from "@/data/sampleListings";
import { fetchPublicListingBySlug, type PublicListing } from "@/lib/publicListings";
import { setPageSeo, injectJsonLd } from "@/lib/seo";
import { ONBOARDING_URL } from "@/lib/config";
import { initListingAnalytics, trackPhotoView, trackLeadSubmitted } from "@/lib/analytics";
import { Phone, Mail, MessageCircle, X, Menu as MenuIcon } from "lucide-react";

// Lazy: keeps qrcode + jspdf out of the initial listing-page bundle.
const ShareSection = lazy(() => import("@/components/ShareSection"));
const PreviewBanner = lazy(() => import("@/components/PreviewBanner"));

/**
 * A listing page is "live" (no preview banner) when the browser's
 * hostname matches the listing's custom domainName. Anywhere else —
 * the marketing site demo route, a staging URL, an iframe — it's a
 * preview that should promote activation.
 */
function isOnCustomDomain(domainName?: string): boolean {
  if (!domainName) return false;
  if (typeof window === "undefined") return false;
  return window.location.hostname.toLowerCase() === domainName.toLowerCase();
}

type FullListing = SampleListing & {
  id?: string;
  photoUrls?: string[];
  agentPhone?: string;
  agentEmail?: string;
  agentPhotoUrl?: string;
  brokerageLogoUrl?: string;
  domainName?: string;
  mode?: "preview" | "live" | "disabled";
  /** MLS listing number if this row was sourced from the MLS feed. */
  mlsId?: string;
  mlsLastSyncedAt?: string;
};

function getTokenFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("token");
}

const NAV_SECTIONS = [
  { id: "home", label: "Home" },
  { id: "story", label: "The Home" },
  { id: "gallery", label: "Gallery" },
  { id: "tour", label: "Virtual Tour" },
  { id: "video", label: "Video" },
  { id: "details", label: "Details" },
  { id: "location", label: "Location" },
  { id: "finance", label: "Finance" },
  { id: "share", label: "Share" },
  { id: "contact", label: "Schedule" },
];

const GOOGLE_MAPS_API_KEY =
  (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined) ?? "";

function MapSection({ address }: { address: string }) {
  if (!GOOGLE_MAPS_API_KEY) return null;
  const src = `https://www.google.com/maps/embed/v1/place?key=${encodeURIComponent(
    GOOGLE_MAPS_API_KEY,
  )}&q=${encodeURIComponent(address)}&zoom=15`;
  const directionsHref = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
    address,
  )}`;
  return (
    <section
      id="location"
      className="pl-24 md:pl-32 px-6 md:px-12 py-20 md:py-28 bg-warm-white"
    >
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <p className="text-[10px] uppercase tracking-[0.4em] text-gold mb-4">
            Location
          </p>
          <h2 className="font-serif text-3xl md:text-5xl text-ink">
            On the map
          </h2>
        </div>
        <div className="aspect-[16/9] w-full overflow-hidden border border-ink/10 bg-cream">
          <iframe
            title={`Map of ${address}`}
            src={src}
            className="w-full h-full"
            style={{ border: 0 }}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            allowFullScreen
          />
        </div>
        <div className="text-center mt-6">
          <a
            href={directionsHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block text-xs uppercase tracking-[0.3em] text-ink border-b border-ink/40 hover:border-ink pb-1 transition-colors"
          >
            Get directions →
          </a>
        </div>
      </div>
    </section>
  );
}

function MenuRail({
  open,
  onToggle,
  brand,
  sections,
}: {
  open: boolean;
  onToggle: (next: boolean) => void;
  brand: string;
  sections: { id: string; label: string }[];
}) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onToggle(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onToggle]);

  return (
    <>
      {/* Vertical rail (always visible, fixed left edge) */}
      <button
        type="button"
        onClick={() => onToggle(!open)}
        className="fixed top-0 left-0 z-50 h-screen w-12 md:w-14 bg-ink text-warm-white flex flex-col items-center justify-between py-6 hover:bg-ink/90 transition-colors"
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        aria-controls="primary-nav-drawer"
      >
        <span className="block">
          {open ? <X size={20} strokeWidth={1.5} /> : <MenuIcon size={20} strokeWidth={1.5} />}
        </span>
        <span
          className="text-[10px] tracking-[0.5em] uppercase font-medium"
          style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
        >
          {open ? "Close" : "Menu"}
        </span>
        <img src="/propsite-logo-light.svg" alt="PropSite" className="w-8 h-auto opacity-80" />
      </button>

      {/* Drawer */}
      <div
        className={`fixed inset-0 z-40 transition-opacity duration-300 ${
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        onClick={() => onToggle(false)}
      >
        <div className="absolute inset-0 bg-ink/70 backdrop-blur-sm" />
        <nav
          id="primary-nav-drawer"
          aria-label="Primary"
          aria-hidden={!open}
          className={`absolute top-0 left-12 md:left-14 h-screen w-[min(420px,calc(100vw-3rem))] bg-warm-white shadow-2xl px-8 md:px-12 py-10 flex flex-col transition-transform duration-300 ${
            open ? "translate-x-0" : "-translate-x-full"
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          <p className="text-[10px] tracking-[0.4em] uppercase text-muted mb-8">{brand}</p>
          <ul className="space-y-1">
            {sections.map((s) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  onClick={() => onToggle(false)}
                  className="block py-3 font-serif text-3xl md:text-4xl text-ink hover:text-gold transition-colors"
                >
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
          <div className="mt-auto pt-8 border-t border-border">
            <p className="text-[10px] tracking-[0.3em] uppercase text-muted mb-2">Auto-built by</p>
            <Link href="/">
              <img src="/propsite-logo.png" alt="PropSite" className="h-4 w-auto max-w-[80px]" />
            </Link>
          </div>
        </nav>
      </div>
    </>
  );
}

function MortgageCalculator({ price }: { price: number }) {
  const [homePrice, setHomePrice] = useState(price);
  const [downPct, setDownPct] = useState(20);
  const [ratePct, setRatePct] = useState(7.0);
  const [years, setYears] = useState<15 | 30>(30);

  useEffect(() => {
    setHomePrice(price);
  }, [price]);

  const downPayment = Math.round((homePrice * downPct) / 100);
  const principal = Math.max(0, homePrice - downPayment);
  const monthlyRate = ratePct / 100 / 12;
  const n = years * 12;
  const monthly =
    monthlyRate === 0
      ? principal / n
      : (principal * monthlyRate * Math.pow(1 + monthlyRate, n)) /
        (Math.pow(1 + monthlyRate, n) - 1);
  const monthlyRounded = isFinite(monthly) && monthly > 0 ? Math.round(monthly) : 0;

  const fmt = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 0 });

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-20 items-start">
      {/* Inputs */}
      <div className="space-y-7">
        <div>
          <label className="flex items-baseline justify-between text-[10px] tracking-[0.3em] uppercase text-muted mb-2">
            <span>Home Price</span>
            <span className="text-ink font-semibold tracking-normal text-sm">
              ${fmt(homePrice)}
            </span>
          </label>
          <input
            type="number"
            value={homePrice}
            onChange={(e) => setHomePrice(Math.max(0, Number(e.target.value) || 0))}
            className="w-full h-11 px-0 bg-transparent text-lg text-ink border-b border-ink/30 focus:outline-none focus:border-ink"
          />
        </div>

        <div>
          <label className="flex items-baseline justify-between text-[10px] tracking-[0.3em] uppercase text-muted mb-2">
            <span>Down Payment</span>
            <span className="text-ink font-semibold tracking-normal text-sm">
              {downPct}% — ${fmt(downPayment)}
            </span>
          </label>
          <input
            type="range"
            min={0}
            max={50}
            step={1}
            value={downPct}
            onChange={(e) => setDownPct(Number(e.target.value))}
            className="w-full accent-ink cursor-pointer"
          />
        </div>

        <div>
          <label className="flex items-baseline justify-between text-[10px] tracking-[0.3em] uppercase text-muted mb-2">
            <span>Interest Rate</span>
            <span className="text-ink font-semibold tracking-normal text-sm">
              {ratePct.toFixed(2)}%
            </span>
          </label>
          <input
            type="range"
            min={2}
            max={12}
            step={0.125}
            value={ratePct}
            onChange={(e) => setRatePct(Number(e.target.value))}
            className="w-full accent-ink cursor-pointer"
          />
        </div>

        <div>
          <p className="text-[10px] tracking-[0.3em] uppercase text-muted mb-3">Loan Term</p>
          <div className="flex gap-3">
            {[15, 30].map((y) => (
              <button
                key={y}
                type="button"
                onClick={() => setYears(y as 15 | 30)}
                className={`flex-1 h-11 text-xs uppercase tracking-[0.2em] border transition-colors ${
                  years === y
                    ? "bg-ink text-warm-white border-ink"
                    : "bg-transparent text-ink border-ink/30 hover:border-ink"
                }`}
              >
                {y} Years
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Result */}
      <div className="md:pt-2">
        <p className="text-[10px] tracking-[0.4em] uppercase text-muted mb-4">
          Estimated Monthly
        </p>
        <p className="font-serif text-6xl md:text-7xl lg:text-8xl text-ink leading-none mb-2">
          ${fmt(monthlyRounded)}
        </p>
        <p className="text-sm text-muted mb-8">Principal &amp; interest, per month</p>
        <dl className="space-y-3 text-sm border-t border-ink/10 pt-6">
          <div className="flex items-center justify-between">
            <dt className="text-muted">Loan amount</dt>
            <dd className="text-ink font-medium">${fmt(principal)}</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-muted">Total of payments</dt>
            <dd className="text-ink font-medium">${fmt(monthlyRounded * n)}</dd>
          </div>
        </dl>
        <p className="text-[11px] text-muted/80 mt-6 italic">
          Estimate only. Excludes taxes, insurance, HOA, and PMI.
        </p>
      </div>
    </div>
  );
}

const API_BASE = import.meta.env.VITE_API_URL ?? "";
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function LeadForm({
  listingId,
  mode,
}: {
  listingId?: string;
  mode?: "preview" | "live" | "disabled";
}) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Real submission only happens against a LIVE listing whose id is a
  // server UUID. Preview/sample listings keep the demo behavior.
  const canSubmitLive = Boolean(
    listingId && UUID_RE.test(listingId) && mode === "live",
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!canSubmitLive) {
      // Demo mode — fire analytics, show thank-you, no API call.
      trackLeadSubmitted(listingId);
      setSubmitted(true);
      return;
    }

    setSubmitting(true);
    try {
      const fullName = `${firstName} ${lastName}`.trim();
      const resp = await fetch(`${API_BASE}/api/leads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listingId,
          name: fullName,
          email,
          phone: phone.trim() || undefined,
          message: message.trim() || undefined,
          source: "listing_site",
        }),
      });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body?.error ?? `Request failed (${resp.status})`);
      }
      trackLeadSubmitted(listingId);
      setSubmitted(true);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again or call the agent directly.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="text-center py-12">
        <div className="text-3xl text-gold mb-4 font-serif">Thank you</div>
        <p className="text-ink font-medium">Your request has been received.</p>
        <p className="text-sm text-muted mt-2">
          {canSubmitLive
            ? "The listing agent will be in touch shortly."
            : "This is a demo — no data was saved."}
        </p>
      </div>
    );
  }
  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <input
          required
          placeholder="First name"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          className="h-11 px-0 bg-transparent text-ink border-b border-ink/30 focus:outline-none focus:border-ink placeholder:text-muted/70 text-sm"
        />
        <input
          required
          placeholder="Last name"
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          className="h-11 px-0 bg-transparent text-ink border-b border-ink/30 focus:outline-none focus:border-ink placeholder:text-muted/70 text-sm"
        />
      </div>
      <input
        required
        type="email"
        placeholder="Email address"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="w-full h-11 px-0 bg-transparent text-ink border-b border-ink/30 focus:outline-none focus:border-ink placeholder:text-muted/70 text-sm"
      />
      <input
        placeholder="Phone (optional)"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        className="w-full h-11 px-0 bg-transparent text-ink border-b border-ink/30 focus:outline-none focus:border-ink placeholder:text-muted/70 text-sm"
      />
      <textarea
        placeholder="Message (optional)"
        rows={3}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        className="w-full px-0 py-3 bg-transparent text-ink border-b border-ink/30 focus:outline-none focus:border-ink placeholder:text-muted/70 text-sm resize-none"
      />
      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded px-3 py-2">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={submitting}
        className="w-full h-14 bg-ink text-warm-white text-xs uppercase tracking-[0.3em] hover:bg-ink/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {submitting ? "Sending…" : "Request a Showing"}
      </button>
      {!canSubmitLive && (
        <p className="text-center text-[11px] text-muted">
          Demo mode — sign up to capture real leads.{" "}
          <a href={ONBOARDING_URL} className="underline hover:text-ink">
            Get started →
          </a>
        </p>
      )}
    </form>
  );
}

function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-warm-white text-center px-6">
      <h1 className="text-3xl font-serif text-ink mb-4">Listing not found</h1>
      <p className="text-muted mb-8">
        This demo listing doesn't exist. Browse our examples instead.
      </p>
      <Link
        href="/#demo"
        className="h-11 px-6 bg-ink text-warm-white font-medium text-sm flex items-center hover:bg-ink/90 transition-colors uppercase tracking-[0.2em]"
      >
        Browse examples
      </Link>
    </div>
  );
}

export default function Listing() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug ?? "";
  const staticListing = getListingBySlug(slug);

  const [apiListing, setApiListing] = useState<PublicListing | null>(null);
  const [apiLoading, setApiLoading] = useState(!staticListing);
  const [menuOpen, setMenuOpen] = useState(false);
  const [refetchTick, setRefetchTick] = useState(0);
  const heroRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (staticListing) return;
    let cancelled = false;
    fetchPublicListingBySlug(slug).then((row) => {
      if (cancelled) return;
      setApiListing(row);
      setApiLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [slug, staticListing, refetchTick]);

  const listing: FullListing | null = staticListing ?? apiListing;

  // Per-listing SEO + RealEstateListing JSON-LD. Runs once we have the
  // listing data; cleans up the JSON-LD when navigating away.
  useEffect(() => {
    if (!listing) return;
    const fullAddress = `${listing.address}, ${listing.city}, ${listing.state} ${listing.zip}`;
    const priceLabel = listing.price
      ? `$${listing.price.toLocaleString("en-US")}`
      : null;
    const bedsBaths = [
      listing.beds ? `${listing.beds} bd` : null,
      listing.baths ? `${listing.baths} ba` : null,
      listing.sqft ? `${listing.sqft.toLocaleString("en-US")} sqft` : null,
    ]
      .filter(Boolean)
      .join(" · ");

    const title = priceLabel
      ? `${listing.address} — ${priceLabel} · ${listing.city}, ${listing.state} | PropSite`
      : `${listing.address} — ${listing.city}, ${listing.state} | PropSite`;
    const description = `${fullAddress}. ${bedsBaths || "For sale"}.${
      listing.description ? ` ${listing.description.slice(0, 140)}` : ""
    }`;

    setPageSeo({
      title,
      description,
      path: `/listing/${listing.slug}`,
      image: (listing.photoUrls ?? [])[0],
    });

    const cleanups: Array<() => void> = [];

    cleanups.push(
      injectJsonLd(`listing-${listing.slug}`, {
        "@context": "https://schema.org",
        "@type": ["Product", "Residence"],
        name: fullAddress,
        description: listing.description ?? `Single-family home for sale at ${fullAddress}.`,
        image: listing.photoUrls ?? [],
        url: listing.domainName
          ? `https://${listing.domainName}`
          : `https://app.propsite.io/listing/${listing.slug}`,
        address: {
          "@type": "PostalAddress",
          streetAddress: listing.address,
          addressLocality: listing.city,
          addressRegion: listing.state,
          postalCode: listing.zip,
          addressCountry: "US",
        },
        ...(listing.price
          ? {
              offers: {
                "@type": "Offer",
                price: listing.price,
                priceCurrency: "USD",
                availability: "https://schema.org/InStock",
                url: listing.domainName
                  ? `https://${listing.domainName}`
                  : `https://app.propsite.io/listing/${listing.slug}`,
              },
            }
          : {}),
        ...(listing.beds ? { numberOfBedrooms: listing.beds } : {}),
        ...(listing.baths ? { numberOfBathroomsTotal: listing.baths } : {}),
        ...(listing.sqft
          ? {
              floorSize: {
                "@type": "QuantitativeValue",
                value: listing.sqft,
                unitCode: "FTK",
              },
            }
          : {}),
        ...(listing.yearBuilt ? { yearBuilt: listing.yearBuilt } : {}),
      }),
    );

    cleanups.push(
      injectJsonLd(`breadcrumb-${listing.slug}`, {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: "PropSite",
            item: "https://app.propsite.io/",
          },
          {
            "@type": "ListItem",
            position: 2,
            name: listing.address,
            item: `https://app.propsite.io/listing/${listing.slug}`,
          },
        ],
      }),
    );

    cleanups.push(initListingAnalytics(listing.id));

    // Fire-and-forget preview-viewed notification to the listing agent.
    // Only fires for API-backed preview listings (not static sample listings).
    // The server rate-limits to once per hour per listing.
    if (listing.id && listing.mode === "preview") {
      const UUID_RE_LOCAL =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      const body = UUID_RE_LOCAL.test(listing.id)
        ? { id: listing.id }
        : { slug: listing.slug };
      fetch(`${API_BASE}/api/listings/preview-viewed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).catch(() => {/* best-effort */});
    }

    return () => {
      for (const fn of cleanups) fn();
    };
  }, [listing]);

  if (apiLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-warm-white text-muted text-sm">
        Loading listing…
      </div>
    );
  }

  if (!listing) return <NotFound />;

  const showPreviewBanner = !isOnCustomDomain(listing.domainName);
  const magicToken = getTokenFromUrl();
  const canActivate =
    showPreviewBanner &&
    listing.mode === "preview" &&
    Boolean(listing.id) &&
    Boolean(magicToken);
  const fullAddress = `${listing.address}, ${listing.city}, ${listing.state} ${listing.zip}`;
  const photos = listing.photoUrls ?? [];
  const heroPhoto = photos[0];
  const galleryPhotos = photos.slice(1);
  const featurePhoto = galleryPhotos[0];
  const remainingGallery = galleryPhotos.slice(1);
  // Virtual tours and videos from the listing (MLS-detected or admin-added)
  type TourEntry = { url: string; provider: string; embedUrl: string; kind: "tour" | "video" };
  const allTourEntries: TourEntry[] = Array.isArray((listing as any).virtualTourUrls)
    ? (listing as any).virtualTourUrls as TourEntry[]
    : [];
  const virtualTours = allTourEntries.filter((t) => t.kind === "tour");
  const videoEmbeds = allTourEntries.filter((t) => t.kind === "video");
  const primaryTour = virtualTours[0] ?? null;
  const primaryVideo = videoEmbeds[0] ?? null;
  const displayDomain = listing.domainName ?? `${listing.slug.toLowerCase()}.propsite.io`;
  const cityState = `${listing.city}, ${listing.state}`.toUpperCase();
  const addressLine = listing.address.toUpperCase();

  return (
    <div className="font-sans bg-warm-white text-ink min-h-screen">
      <MenuRail
        open={menuOpen}
        onToggle={setMenuOpen}
        brand={displayDomain}
        sections={NAV_SECTIONS.filter((s) => {
          if (s.id === "gallery" && remainingGallery.length === 0) return false;
          if (s.id === "tour" && !primaryTour) return false;
          if (s.id === "video" && !primaryVideo) return false;
          return true;
        })}
      />

      {/* HERO — full-bleed photo, editorial overlay */}
      <header
        id="home"
        ref={heroRef}
        className="relative h-screen min-h-[600px] w-full pl-24 md:pl-32"
        style={
          heroPhoto
            ? {
                backgroundImage: `linear-gradient(to bottom, rgba(10,30,58,0.25) 0%, rgba(10,30,58,0) 30%, rgba(10,30,58,0) 60%, rgba(10,30,58,0.55) 100%), url(${heroPhoto})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }
            : { background: "linear-gradient(135deg, #0a1e3a 0%, #1a3358 60%, #2d4a78 100%)" }
        }
      >
        {/* Top bar */}
        <div className="absolute top-0 inset-x-0 pl-24 md:pl-32 px-6 md:px-12 py-6 md:py-8 flex items-start justify-between gap-4 text-warm-white">
          <a
            href="#home"
            className="font-serif text-base md:text-xl tracking-tight drop-shadow-md hover:opacity-80 transition-opacity"
          >
            {displayDomain}
          </a>
          <a
            href="#contact"
            className="border border-warm-white/80 text-warm-white text-[10px] md:text-xs uppercase tracking-[0.3em] px-4 md:px-6 py-2.5 md:py-3 hover:bg-warm-white hover:text-ink transition-colors backdrop-blur-sm"
          >
            Schedule a Tour
          </a>
        </div>

        {/* Bottom overlay — extra bottom padding on mobile clears the sticky CTA bar + preview banner */}
        <div className="absolute bottom-0 inset-x-0 pl-24 md:pl-32 px-6 md:px-12 pb-40 md:pb-14 flex flex-col md:flex-row md:items-end justify-between gap-6 text-warm-white">
          <div>
            <p className="font-serif text-4xl md:text-6xl lg:text-7xl leading-none drop-shadow-lg">
              {formatPrice(listing.price)}
            </p>
            <p className="text-[10px] md:text-xs uppercase tracking-[0.3em] mt-2 md:mt-3 text-warm-white/80">
              {listing.beds} Bed · {listing.baths} Bath · {listing.sqft.toLocaleString()} Sq Ft
            </p>
            <p className="font-serif text-lg md:text-2xl mt-4 md:mt-6 tracking-wide drop-shadow-md">
              {addressLine}
            </p>
            <p className="text-[10px] md:text-xs uppercase tracking-[0.3em] mt-1 text-warm-white/80">
              {cityState} {listing.zip}
            </p>
          </div>

          <div className="hidden md:block text-right">
            <p className="font-serif text-xl md:text-2xl drop-shadow-md">Open House</p>
            <p className="text-[10px] md:text-xs uppercase tracking-[0.3em] mt-1 text-warm-white/80">
              By appointment · Schedule below
            </p>
          </div>
        </div>
      </header>

      {/* STORY / DESCRIPTION — editorial */}
      <section id="story" className="pl-24 md:pl-32 px-6 md:px-12 py-24 md:py-32 bg-warm-white">
        <div className="max-w-3xl mx-auto text-center">
          <p className="text-[10px] uppercase tracking-[0.4em] text-gold mb-6">The Home</p>
          <h2 className="font-serif text-4xl md:text-6xl text-ink leading-[1.05] mb-10">
            {listing.address}
          </h2>
          <p className="text-ink/75 leading-[1.9] text-lg md:text-xl font-light">
            {listing.description}
          </p>
        </div>
      </section>

      {/* FEATURE PHOTO — full-bleed */}
      {featurePhoto && (
        <section className="pl-24 md:pl-32">
          <div
            className="w-full h-[60vh] md:h-[80vh] bg-ink"
            style={{
              backgroundImage: `url(${featurePhoto})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
          />
        </section>
      )}

      {/* SPECS BAR */}
      <section
        id="details"
        className="pl-24 md:pl-32 px-6 md:px-12 py-20 md:py-28 bg-cream"
      >
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-[10px] uppercase tracking-[0.4em] text-gold mb-4">Property</p>
            <h2 className="font-serif text-3xl md:text-5xl text-ink">At a glance</h2>
          </div>

          <dl className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-y-12 gap-x-6 border-y border-ink/15 py-12">
            {[
              ["Bedrooms", listing.beds],
              ["Bathrooms", listing.baths],
              ["Living Area", `${listing.sqft.toLocaleString()} sf`],
              ["Lot Size", `${listing.lotAcres} ac`],
              ["Year Built", listing.yearBuilt],
              ["Garage", listing.garage ? "Yes" : "—"],
            ].map(([label, value], i) => (
              <div key={i} className="text-center">
                <dd className="font-serif text-3xl md:text-4xl text-ink leading-none">{value}</dd>
                <dt className="text-[10px] uppercase tracking-[0.3em] text-muted mt-3">
                  {label}
                </dt>
              </div>
            ))}
          </dl>

          {/* Neighborhood scores hidden — no automated source available; revisit if a Walk Score / GreatSchools integration is added. */}
        </div>
      </section>

      {/* LOCATION / MAP */}
      <MapSection address={fullAddress} />

      {/* GALLERY */}
      {remainingGallery.length > 0 && (
        <section id="gallery" className="pl-24 md:pl-32 px-0 md:px-0 py-20 md:py-28 bg-warm-white">
          <div className="text-center mb-14 px-6">
            <p className="text-[10px] uppercase tracking-[0.4em] text-gold mb-4">Gallery</p>
            <h2 className="font-serif text-3xl md:text-5xl text-ink">Take a closer look</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-1 md:gap-2 px-1 md:px-2">
            {remainingGallery.map((url, i) => (
              <a
                key={i}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => trackPhotoView(listing.id, i + 2)}
                className={`block bg-cream overflow-hidden group ${
                  i % 5 === 0 ? "md:col-span-2 aspect-[16/8]" : "aspect-[4/3]"
                }`}
              >
                <img
                  src={url}
                  alt={`${listing.address} photo ${i + 2}`}
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.03]"
                  loading="lazy"
                />
              </a>
            ))}
          </div>
        </section>
      )}

      {/* VIRTUAL TOUR */}
      {primaryTour && (
        <section id="tour" className="pl-24 md:pl-32 px-6 md:px-12 py-20 md:py-28 bg-cream border-t border-ink/10">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-12">
              <p className="text-[10px] uppercase tracking-[0.4em] text-gold mb-4">Virtual Tour</p>
              <h2 className="font-serif text-3xl md:text-5xl text-ink">Explore every room</h2>
            </div>
            <div className="relative w-full aspect-[16/9] bg-ink overflow-hidden rounded-sm shadow-lg">
              <iframe
                src={primaryTour.embedUrl}
                title={`Virtual tour of ${listing.address}`}
                className="absolute inset-0 w-full h-full border-0"
                allowFullScreen
                allow="xr-spatial-tracking; fullscreen"
                loading="lazy"
              />
            </div>
            {primaryTour.provider !== "unknown" && (
              <p className="text-center text-xs text-muted mt-4 capitalize">
                Powered by {primaryTour.provider === "zillow3d" ? "Zillow 3D" : primaryTour.provider === "iguide" ? "iGUIDE" : primaryTour.provider}
              </p>
            )}
            {virtualTours.length > 1 && (
              <div className="mt-6 flex flex-wrap justify-center gap-3">
                {virtualTours.slice(1).map((t, i) => (
                  <a
                    key={i}
                    href={t.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-medium text-ink border border-ink/30 px-4 py-2 hover:border-gold hover:text-gold transition-colors"
                  >
                    View additional tour {i + 2} →
                  </a>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* VIDEO WALKTHROUGH */}
      {primaryVideo && (
        <section id="video" className="pl-24 md:pl-32 px-6 md:px-12 py-20 md:py-28 bg-warm-white border-t border-ink/10">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-12">
              <p className="text-[10px] uppercase tracking-[0.4em] text-gold mb-4">Video</p>
              <h2 className="font-serif text-3xl md:text-5xl text-ink">Watch the walkthrough</h2>
            </div>
            <div className="relative w-full aspect-[16/9] bg-ink overflow-hidden rounded-sm shadow-lg">
              <iframe
                src={primaryVideo.embedUrl}
                title={`Video walkthrough of ${listing.address}`}
                className="absolute inset-0 w-full h-full border-0"
                allowFullScreen
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                loading="lazy"
              />
            </div>
          </div>
        </section>
      )}

      {/* FINANCE / MORTGAGE */}
      <section
        id="finance"
        className="pl-24 md:pl-32 px-6 md:px-12 py-24 md:py-32 bg-cream"
      >
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-[10px] uppercase tracking-[0.4em] text-gold mb-4">Finance</p>
            <h2 className="font-serif text-3xl md:text-5xl text-ink">Estimate your payment</h2>
          </div>
          <MortgageCalculator price={listing.price} />
        </div>
      </section>

      {/* SHARE — QR + sign rider + flyer, all auto-generated.
          Prefer the live custom domain (canonical URL on activated sites);
          fall back to the demo route for preview/example listings. */}
      {showPreviewBanner && (
        <Suspense fallback={null}>
          {canActivate && listing.id && magicToken ? (
            <PreviewBanner
              variant="activate"
              address={listing.address}
              slug={listing.slug}
              listingId={listing.id}
              token={magicToken}
              onActivated={() => setRefetchTick((n) => n + 1)}
            />
          ) : (
            <PreviewBanner address={listing.address} slug={listing.slug} />
          )}
        </Suspense>
      )}

      <Suspense fallback={null}>
        <ShareSection
          listing={listing}
          shareUrl={
            listing.domainName
              ? `https://${listing.domainName}`
              : typeof window !== "undefined"
                ? `${window.location.origin}/listing/${listing.slug}`
                : `https://${displayDomain}`
          }
        />
      </Suspense>

      {/* SCHEDULE / CONTACT */}
      <section
        id="contact"
        className="pl-24 md:pl-32 px-6 md:px-12 py-24 md:py-32 bg-ink text-warm-white"
      >
        <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-24 items-start">
          <div>
            <p className="text-[10px] uppercase tracking-[0.4em] text-gold mb-4">Schedule</p>
            <h2 className="font-serif text-4xl md:text-6xl leading-[1.05] mb-8">
              Come see it in person.
            </h2>
            <p className="text-warm-white/75 text-lg leading-relaxed mb-12 font-light">
              Tell us when works for you and the listing agent will reach out within 60 seconds
              to confirm your private tour.
            </p>

            {(listing.agentName || listing.agentBrokerage) && (
              <div className="border-t border-warm-white/15 pt-8">
                <p className="text-[10px] uppercase tracking-[0.4em] text-warm-white/60 mb-5">
                  Listed by
                </p>
                <div className="flex items-start gap-5">
                  {listing.agentPhotoUrl && (
                    <img
                      src={listing.agentPhotoUrl}
                      alt={listing.agentName ?? "Listing agent"}
                      className="w-16 h-16 rounded-full object-cover shrink-0 ring-1 ring-warm-white/20"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-serif text-2xl leading-tight">{listing.agentName}</p>
                    {listing.agentBrokerage && (
                      <p className="text-sm text-warm-white/60 mt-1">{listing.agentBrokerage}</p>
                    )}
                    {(listing.agentPhone || listing.agentEmail) && (
                      <div className="mt-4 space-y-2">
                        {listing.agentPhone && (
                          <a
                            href={`tel:${listing.agentPhone.replace(/[^0-9+]/g, "")}`}
                            className="flex items-center gap-3 text-sm text-warm-white/85 hover:text-gold transition-colors"
                          >
                            <Phone size={14} className="text-gold shrink-0" />
                            {listing.agentPhone}
                          </a>
                        )}
                        {listing.agentEmail && (
                          <a
                            href={`mailto:${listing.agentEmail}`}
                            className="flex items-center gap-3 text-sm text-warm-white/85 hover:text-gold transition-colors break-all"
                          >
                            <Mail size={14} className="text-gold shrink-0" />
                            {listing.agentEmail}
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                {listing.brokerageLogoUrl && (
                  <div className="mt-6 pt-6 border-t border-warm-white/10">
                    <img
                      src={listing.brokerageLogoUrl}
                      alt={`${listing.agentBrokerage ?? "Brokerage"} logo`}
                      className="max-h-10 max-w-[140px] object-contain opacity-90 brightness-0 invert"
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="bg-warm-white text-ink p-8 md:p-12">
            <h3 className="font-serif text-2xl text-ink mb-2">Request a private showing</h3>
            <p className="text-xs text-muted mb-8">
              We'll connect you with the agent in under a minute.
            </p>
            <LeadForm listingId={listing.id} mode={listing.mode} />
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="pl-24 md:pl-32 px-6 md:px-12 py-12 bg-warm-white border-t border-ink/10 pb-24 md:pb-12">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-4 text-center md:text-left">
          <p className="text-xs text-muted uppercase tracking-[0.2em]">{fullAddress}</p>
          <Link href="/" className="flex items-center gap-1 text-xs text-muted hover:text-ink transition-colors">
            Auto-built by{" "}
            <img src="/propsite-logo.png" alt="PropSite" className="h-4 w-auto inline-block align-middle ml-1" />
          </Link>
        </div>
        {/* IDX / MLS attribution — required when listing data comes from
            the MLS. Shown only for MLS-sourced rows so demo and self-
            entered listings stay clean. */}
        {listing.mlsId && (
          <div className="max-w-6xl mx-auto mt-8 pt-6 border-t border-ink/10 text-[11px] text-muted leading-relaxed">
            <p>
              MLS #{listing.mlsId}
              {listing.agentBrokerage
                ? ` · Listing courtesy of ${listing.agentBrokerage}`
                : ""}
            </p>
            {listing.mlsLastSyncedAt && (
              <p className="mt-0.5">
                Last updated{" "}
                {new Date(listing.mlsLastSyncedAt).toLocaleString(undefined, {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </p>
            )}
            <p className="mt-1">
              Listing data is provided by participating MLS members and is
              deemed reliable but not guaranteed. Information is provided
              exclusively for consumers' personal, non-commercial use and
              may not be used for any purpose other than to identify
              prospective properties consumers may be interested in
              purchasing.
            </p>
          </div>
        )}
      </footer>

      {/* MOBILE STICKY CTA */}
      <div className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-ink text-warm-white border-t border-warm-white/10 grid grid-cols-3 pb-[env(safe-area-inset-bottom)] pl-12">
        {listing.agentPhone ? (
          <a
            href={`tel:${listing.agentPhone.replace(/[^0-9+]/g, "")}`}
            className="flex flex-col items-center justify-center gap-1 py-3 text-[10px] uppercase tracking-[0.2em] border-r border-warm-white/15 active:bg-ink/80"
          >
            <Phone size={16} className="text-gold" />
            Call
          </a>
        ) : (
          <a
            href="#contact"
            className="flex flex-col items-center justify-center gap-1 py-3 text-[10px] uppercase tracking-[0.2em] border-r border-warm-white/15 active:bg-ink/80"
          >
            <Phone size={16} className="text-gold" />
            Contact
          </a>
        )}
        {listing.agentPhone ? (
          <a
            href={`sms:${listing.agentPhone.replace(/[^0-9+]/g, "")}`}
            className="flex flex-col items-center justify-center gap-1 py-3 text-[10px] uppercase tracking-[0.2em] border-r border-warm-white/15 active:bg-ink/80"
          >
            <MessageCircle size={16} className="text-gold" />
            Text
          </a>
        ) : (
          <a
            href="#contact"
            className="flex flex-col items-center justify-center gap-1 py-3 text-[10px] uppercase tracking-[0.2em] border-r border-warm-white/15 active:bg-ink/80"
          >
            <MessageCircle size={16} className="text-gold" />
            Text
          </a>
        )}
        <a
          href="#contact"
          className="flex flex-col items-center justify-center gap-1 py-3 text-[10px] uppercase tracking-[0.2em] bg-gold text-ink font-semibold active:bg-gold/90"
        >
          <span className="font-serif text-base normal-case tracking-normal leading-none">Tour</span>
          <span>Schedule</span>
        </a>
      </div>
    </div>
  );
}
