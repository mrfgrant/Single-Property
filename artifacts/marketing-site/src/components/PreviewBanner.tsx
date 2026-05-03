import { Link } from "wouter";
import { ONBOARDING_URL } from "@/lib/config";

interface Props {
  /** The address being previewed — used in the CTA copy. */
  address: string;
  /** Slug carries through onboarding so we can link the agent back here. */
  slug: string;
}

/**
 * Sticky banner shown on a listing page when it's being viewed as a free
 * preview (i.e. not from the listing's own custom domain). Promotes the
 * $49/mo activation flow without obstructing the page.
 *
 * Hidden automatically on the listing's own custom domain — see
 * `Listing.tsx` for the hostname check.
 */
export default function PreviewBanner({ address, slug }: Props) {
  return (
    <div
      data-testid="preview-banner"
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 max-w-[calc(100vw-2rem)]"
      role="region"
      aria-label="Activate this property site"
    >
      <div className="flex items-center gap-3 md:gap-5 bg-ink text-warm-white pl-4 pr-2 py-2 md:pl-6 md:pr-3 md:py-3 rounded-full shadow-2xl border border-warm-white/10">
        <span className="hidden sm:inline-block w-1.5 h-1.5 rounded-full bg-gold animate-pulse" aria-hidden />
        <p className="text-[11px] md:text-xs leading-snug">
          <span className="hidden md:inline text-warm-white/70 uppercase tracking-[0.25em] mr-2">
            Free preview
          </span>
          <span className="font-medium">Like this site for {shortAddress(address)}?</span>
        </p>
        <Link
          href={`${ONBOARDING_URL}?listing=${encodeURIComponent(slug)}`}
          data-testid="preview-banner-cta"
          className="shrink-0 inline-flex items-center h-9 md:h-10 px-4 md:px-5 rounded-full bg-gold text-ink text-[11px] md:text-xs font-semibold uppercase tracking-[0.2em] hover:bg-gold/90 transition-colors"
        >
          Claim — $49/mo
        </Link>
      </div>
    </div>
  );
}

function shortAddress(addr: string): string {
  // Drop the city/state suffix if present — banner already lives in the
  // page's context.
  return addr.split(",")[0]?.trim() || addr;
}
