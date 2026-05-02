import React, { useEffect, useState } from "react";
import { Link, useParams } from "wouter";
import { getListingBySlug, formatPrice, type SampleListing } from "@/data/sampleListings";
import { fetchPublicListingBySlug, type PublicListing } from "@/lib/publicListings";
import { WORDMARK_PREFIX, WORDMARK_SUFFIX } from "@/lib/copy";
import { ONBOARDING_URL } from "@/lib/config";
import { Bed, Bath, Car, Square, MapPin, Calendar, Phone, Mail, Calculator } from "lucide-react";

type FullListing = SampleListing & {
  photoUrls?: string[];
  agentPhone?: string;
  agentEmail?: string;
  agentPhotoUrl?: string;
  domainName?: string;
};

function ScoreChip({ label, score }: { label: string; score: number }) {
  const color =
    score >= 70
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : score >= 45
      ? "bg-amber-50 text-amber-700 border-amber-200"
      : "bg-red-50 text-red-700 border-red-200";
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border ${color}`}>
      <span className="font-bold">{score}</span>
      <span className="font-normal opacity-80">{label}</span>
    </span>
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
  const totalInterest = Math.max(0, Math.round(monthlyRounded * n - principal));

  const fmt = (n: number) =>
    n.toLocaleString("en-US", { maximumFractionDigits: 0 });

  return (
    <div className="bg-white border border-border rounded-md overflow-hidden">
      <div className="flex items-center gap-2 bg-cream px-5 py-3 border-b border-border">
        <Calculator size={15} className="text-gold" />
        <h3 className="text-xs font-bold text-ink uppercase tracking-[0.2em]">
          Mortgage Calculator
        </h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[1fr_280px]">
        {/* Inputs */}
        <div className="p-5 md:p-6 space-y-5 border-b md:border-b-0 md:border-r border-border">
          {/* Home price */}
          <div>
            <label className="flex items-center justify-between text-xs font-semibold text-ink mb-1.5">
              <span>Home price</span>
              <span className="text-muted font-normal">${fmt(homePrice)}</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted">$</span>
              <input
                type="number"
                value={homePrice}
                onChange={(e) => setHomePrice(Math.max(0, Number(e.target.value) || 0))}
                className="w-full h-10 pl-7 pr-3 rounded border border-border text-sm bg-warm-white focus:outline-none focus:border-ink"
              />
            </div>
          </div>

          {/* Down payment */}
          <div>
            <label className="flex items-center justify-between text-xs font-semibold text-ink mb-1.5">
              <span>Down payment</span>
              <span className="text-muted font-normal">
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
              className="w-full accent-gold cursor-pointer"
            />
          </div>

          {/* Interest rate */}
          <div>
            <label className="flex items-center justify-between text-xs font-semibold text-ink mb-1.5">
              <span>Interest rate</span>
              <span className="text-muted font-normal">{ratePct.toFixed(2)}%</span>
            </label>
            <input
              type="range"
              min={2}
              max={12}
              step={0.125}
              value={ratePct}
              onChange={(e) => setRatePct(Number(e.target.value))}
              className="w-full accent-gold cursor-pointer"
            />
          </div>

          {/* Loan term */}
          <div>
            <label className="text-xs font-semibold text-ink mb-1.5 block">
              Loan term
            </label>
            <div className="flex gap-2">
              {[15, 30].map((y) => (
                <button
                  key={y}
                  type="button"
                  onClick={() => setYears(y as 15 | 30)}
                  className={`flex-1 h-10 text-sm font-semibold rounded border transition-colors ${
                    years === y
                      ? "bg-ink text-white border-ink"
                      : "bg-warm-white text-ink border-border hover:border-ink"
                  }`}
                >
                  {y} years
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Result */}
        <div className="bg-ink/95 text-white p-6 flex flex-col justify-center">
          <p className="text-[10px] uppercase tracking-[0.2em] text-white/60 mb-2">
            Estimated monthly payment
          </p>
          <p className="text-3xl md:text-4xl font-bold text-gold leading-none mb-1">
            ${fmt(monthlyRounded)}
            <span className="text-sm font-normal text-white/50">/mo</span>
          </p>
          <p className="text-xs text-white/60 mb-5">Principal &amp; interest</p>

          <dl className="space-y-2 text-xs border-t border-white/10 pt-4">
            <div className="flex items-center justify-between">
              <dt className="text-white/60">Loan amount</dt>
              <dd className="font-semibold text-white">${fmt(principal)}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-white/60">Total interest</dt>
              <dd className="font-semibold text-white">${fmt(totalInterest)}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-white/60">Total of payments</dt>
              <dd className="font-semibold text-white">
                ${fmt(monthlyRounded * n)}
              </dd>
            </div>
          </dl>

          <p className="text-[10px] text-white/40 mt-4 leading-relaxed">
            Estimate only. Excludes taxes, insurance, HOA, and PMI.
          </p>
        </div>
      </div>
    </div>
  );
}

function StatTile({ icon: Icon, value, label }: { icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>; value: string | number; label: string }) {
  return (
    <div className="flex items-center gap-3 px-5 py-5">
      <Icon size={28} strokeWidth={1.4} className="text-gold/90 shrink-0" />
      <div className="min-w-0">
        <p className="text-xl font-bold text-white leading-none">{value}</p>
        <p className="text-[10px] uppercase tracking-[0.15em] text-white/60 mt-1.5">{label}</p>
      </div>
    </div>
  );
}

function LeadForm() {
  const [submitted, setSubmitted] = useState(false);
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
  };
  if (submitted) {
    return (
      <div className="text-center py-8">
        <div className="text-4xl mb-3">✓</div>
        <p className="font-semibold text-ink">Request received!</p>
        <p className="text-sm text-muted mt-1">This is a demo — no data was saved.</p>
      </div>
    );
  }
  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="flex flex-col sm:flex-row gap-3">
        <input required placeholder="First name" className="flex-1 h-11 px-3 rounded border border-border text-sm bg-warm-white focus:outline-none focus:border-ink" />
        <input required placeholder="Last name" className="flex-1 h-11 px-3 rounded border border-border text-sm bg-warm-white focus:outline-none focus:border-ink" />
      </div>
      <input required type="email" placeholder="Email address" className="h-11 px-3 rounded border border-border text-sm bg-warm-white focus:outline-none focus:border-ink" />
      <input placeholder="Phone (optional)" className="h-11 px-3 rounded border border-border text-sm bg-warm-white focus:outline-none focus:border-ink" />
      <button type="submit" className="h-12 bg-gold text-white font-semibold text-sm uppercase tracking-wider rounded hover:bg-gold/90 transition-colors">
        Request a Showing
      </button>
      <p className="text-center text-xs text-muted">
        Demo mode — sign up to capture real leads.{" "}
        <a href={ONBOARDING_URL} className="underline hover:text-ink">Get started →</a>
      </p>
    </form>
  );
}

function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-warm-white text-center px-6">
      <h1 className="text-3xl font-serif font-bold text-ink mb-4">Listing not found</h1>
      <p className="text-muted mb-8">This demo listing doesn't exist. Browse our examples instead.</p>
      <Link href="/#demo" className="h-11 px-6 bg-ink text-warm-white rounded font-medium text-sm flex items-center hover:bg-ink/90 transition-colors">
        ← Browse examples
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
  }, [slug, staticListing]);

  const listing: FullListing | null = staticListing ?? apiListing;

  if (apiLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-warm-white text-muted text-sm">
        Loading listing…
      </div>
    );
  }

  if (!listing) return <NotFound />;

  const fullAddress = `${listing.address}, ${listing.city}, ${listing.state} ${listing.zip}`;
  const photos = listing.photoUrls ?? [];
  const heroPhoto = photos[0];
  const stripPhotos = photos.slice(1, 6);
  const galleryPhotos = photos.slice(1);
  const displayDomain = listing.domainName ?? `${listing.slug.toLowerCase()}.propsite.io`;

  return (
    <div className="font-sans bg-warm-white">
      {/* Hero */}
      <header
        id="home"
        className="relative min-h-screen flex flex-col text-white"
        style={
          heroPhoto
            ? {
                backgroundImage: `linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.15) 25%, rgba(0,0,0,0.15) 60%, rgba(0,0,0,0.7) 100%), url(${heroPhoto})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }
            : { background: "linear-gradient(135deg, #1a2e1a 0%, #2d4a2d 40%, #3a5c3a 100%)" }
        }
      >
        {/* Top nav */}
        <nav className="relative z-10 flex items-center justify-between px-6 md:px-12 py-6">
          <a
            href="#home"
            className="text-xl md:text-2xl font-serif font-bold text-white drop-shadow-md hover:opacity-90 transition-opacity"
          >
            {displayDomain}
          </a>
          <div className="hidden md:flex items-center gap-7 text-xs font-semibold tracking-[0.2em] text-white">
            <a href="#home" className="hover:text-gold transition-colors uppercase">Home</a>
            <a href="#gallery" className="hover:text-gold transition-colors uppercase">Gallery</a>
            <a href="#details" className="hover:text-gold transition-colors uppercase">Details</a>
            <a href="#about" className="hover:text-gold transition-colors uppercase">About</a>
            <a href="#contact" className="hover:text-gold transition-colors uppercase">Contact Agent</a>
          </div>
        </nav>

        {/* Center floating card */}
        <div className="flex-1 flex items-center justify-center px-6 py-10">
          <div className="w-full max-w-4xl flex flex-col md:flex-row shadow-2xl rounded-sm overflow-hidden">
            {/* Left — price + address + CTA */}
            <div className="flex-1 bg-white/95 backdrop-blur-sm px-8 py-8 md:py-10 flex flex-col justify-center">
              <p className="text-4xl md:text-5xl font-bold text-gold mb-3 leading-none tracking-tight">
                {formatPrice(listing.price)}
              </p>
              <p className="text-ink font-semibold text-lg mb-1 leading-tight">{listing.address}</p>
              <p className="text-muted text-sm mb-7">
                {listing.city}, {listing.state} {listing.zip}
              </p>
              <a
                href="#contact"
                className="block w-full text-center bg-gold hover:bg-gold/90 text-white font-bold uppercase tracking-[0.18em] text-xs py-4 transition-colors rounded-sm"
              >
                Schedule a Showing
              </a>
            </div>

            {/* Right — stat panel */}
            <div className="bg-ink/95 backdrop-blur-sm grid grid-cols-2 md:w-[280px]">
              <div className="border-b border-r border-white/10">
                <StatTile icon={Bed} value={listing.beds} label={listing.beds === 1 ? "Bedroom" : "Bedrooms"} />
              </div>
              <div className="border-b border-white/10">
                <StatTile icon={Bath} value={listing.baths} label={listing.baths === 1 ? "Bath" : "Baths"} />
              </div>
              <div className="border-r border-white/10">
                <StatTile icon={Car} value={listing.garage ? "Yes" : "—"} label="Garage" />
              </div>
              <div>
                <StatTile icon={Square} value={listing.sqft.toLocaleString()} label="Sq Ft" />
              </div>
            </div>
          </div>
        </div>

        {/* Bottom photo strip */}
        {stripPhotos.length > 0 && (
          <div className="relative grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 bg-black/40">
            {stripPhotos.map((url, i) => (
              <a
                key={i}
                href="#gallery"
                className="aspect-[4/3] overflow-hidden block group relative"
              >
                <img
                  src={url}
                  alt={`${listing.address} photo ${i + 2}`}
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
              </a>
            ))}
          </div>
        )}
      </header>

      {/* Gallery */}
      {galleryPhotos.length > 0 && (
        <section id="gallery" className="py-16 px-6 md:px-12 bg-cream">
          <div className="max-w-6xl mx-auto">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-gold mb-2">Gallery</p>
            <h2 className="text-3xl md:text-4xl font-serif font-bold text-ink mb-10">
              Take a closer look
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
              {galleryPhotos.map((url, i) => (
                <a
                  key={i}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block aspect-[4/3] overflow-hidden rounded-md bg-warm-white border border-border group"
                >
                  <img
                    src={url}
                    alt={`${listing.address} photo ${i + 2}`}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    loading="lazy"
                  />
                </a>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Details + About */}
      <section id="details" className="py-16 px-6 md:px-12 bg-warm-white">
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-12">
          {/* Left column */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-gold mb-2">Property</p>
            <h2 id="about" className="text-3xl md:text-4xl font-serif font-bold text-ink mb-6 leading-tight">
              About this home
            </h2>

            {/* Quick info bar */}
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted mb-8 pb-6 border-b border-border">
              <span className="flex items-center gap-1.5">
                <MapPin size={15} className="text-gold" />
                {listing.city}, {listing.state}
              </span>
              <span className="flex items-center gap-1.5">
                <Calendar size={15} className="text-gold" />
                Built {listing.yearBuilt}
              </span>
              <span>{listing.lotAcres} acres</span>
            </div>

            {/* Description */}
            <p className="text-ink/80 leading-relaxed mb-10 text-[15px]">
              {listing.description}
            </p>

            {/* Property details grid */}
            <div className="border border-border rounded-md overflow-hidden mb-10">
              <div className="bg-cream px-5 py-3 border-b border-border">
                <h3 className="text-xs font-bold text-ink uppercase tracking-[0.2em]">Property Details</h3>
              </div>
              <dl className="grid grid-cols-2 divide-x divide-border">
                {[
                  ["Bedrooms", listing.beds],
                  ["Bathrooms", listing.baths],
                  ["Living Area", `${listing.sqft.toLocaleString()} sqft`],
                  ["Lot Size", `${listing.lotAcres} acres`],
                  ["Year Built", listing.yearBuilt],
                  ["Garage", listing.garage ? "Yes" : "No"],
                ].map(([label, value], i) => (
                  <div key={i} className="px-5 py-3 border-b border-border last:border-b-0">
                    <dt className="text-[11px] uppercase tracking-wider text-muted mb-0.5">{label}</dt>
                    <dd className="text-sm font-semibold text-ink">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>

            {/* Mortgage calculator */}
            <div className="mb-10">
              <MortgageCalculator price={listing.price} />
            </div>

            {/* Neighborhood */}
            <div>
              <h3 className="text-xs font-bold text-ink uppercase tracking-[0.2em] mb-3">Neighborhood</h3>
              <div className="flex flex-wrap gap-2">
                <ScoreChip label="Walk" score={listing.walkScore} />
                <ScoreChip label="Bike" score={listing.bikeScore} />
                <ScoreChip label="Schools" score={listing.schoolRating * 10} />
                <ScoreChip label="Transit" score={listing.transitScore} />
              </div>
            </div>
          </div>

          {/* Right column — sticky lead form + agent */}
          <aside id="contact" className="lg:sticky lg:top-6 self-start space-y-4">
            <div className="border border-border rounded-md p-6 bg-white shadow-sm">
              <h3 className="font-serif font-bold text-ink text-xl mb-1">Request a Showing</h3>
              <p className="text-xs text-muted mb-5">We'll connect you with the listing agent within 60 seconds.</p>
              <LeadForm />
            </div>

            {/* Agent card */}
            {(listing.agentName || listing.agentBrokerage) && (
              <div className="border border-border rounded-md p-5 bg-cream">
                <p className="text-[11px] uppercase tracking-wider text-muted mb-2">Listed by</p>
                <p className="font-semibold text-ink text-base">{listing.agentName}</p>
                {listing.agentBrokerage && (
                  <p className="text-sm text-muted mt-0.5">{listing.agentBrokerage}</p>
                )}
                {(listing.agentPhone || listing.agentEmail) && (
                  <div className="mt-3 pt-3 border-t border-border space-y-1.5">
                    {listing.agentPhone && (
                      <a href={`tel:${listing.agentPhone}`} className="flex items-center gap-2 text-sm text-ink hover:text-gold transition-colors">
                        <Phone size={13} className="text-gold" />
                        {listing.agentPhone.trim()}
                      </a>
                    )}
                    {listing.agentEmail && (
                      <a href={`mailto:${listing.agentEmail}`} className="flex items-center gap-2 text-sm text-ink hover:text-gold transition-colors break-all">
                        <Mail size={13} className="text-gold shrink-0" />
                        {listing.agentEmail}
                      </a>
                    )}
                  </div>
                )}
              </div>
            )}
          </aside>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-8 px-6 text-center bg-warm-white">
        <p className="text-xs text-muted">
          {fullAddress}
        </p>
        <p className="text-xs text-muted mt-2">
          Site auto-built by{" "}
          <Link href="/" className="font-semibold hover:text-gold transition-colors">
            <span className="text-ink">{WORDMARK_PREFIX}</span>
            <span className="text-gold">{WORDMARK_SUFFIX}</span>
          </Link>
        </p>
      </footer>
    </div>
  );
}
