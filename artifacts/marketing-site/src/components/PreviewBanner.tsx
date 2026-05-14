import { useState } from "react";
import { Link } from "wouter";
import { ONBOARDING_URL } from "@/lib/config";

const API_BASE = import.meta.env.VITE_API_URL ?? "";

interface BaseProps {
  /** The address being previewed — used in the CTA copy. */
  address: string;
  /** Slug carries through onboarding so we can link the agent back here. */
  slug: string;
}

interface ClaimProps extends BaseProps {
  variant?: "claim";
}

interface ActivateProps extends BaseProps {
  variant: "activate";
  /** Real listings.id UUID — required for the activate POST. */
  listingId: string;
  /** Magic agent token from the URL. */
  token: string;
  /** Called after a successful activation so the page can re-fetch. */
  onActivated?: () => void;
}

type Props = ClaimProps | ActivateProps;

/**
 * Sticky banner shown on a listing page when it's being viewed as a free
 * preview (i.e. not from the listing's own custom domain).
 *
 * Two variants:
 *  - `claim` (default): no token, soft CTA → /onboarding?listing=<slug>.
 *    Used for example/demo pages and unauthenticated visitors.
 *  - `activate`: agent has clicked their preview email's magic link.
 *    Posts directly to `/api/listings/:id/activate?token=…` and shows
 *    a "Site is live" confirmation on success.
 *
 * Hidden automatically on the listing's own custom domain — see
 * `Listing.tsx` for the hostname check.
 */
export default function PreviewBanner(props: Props) {
  if (props.variant === "activate") {
    return <ActivateBanner {...props} />;
  }
  return <ClaimBanner address={props.address} slug={props.slug} />;
}

function ClaimBanner({ address, slug }: BaseProps) {
  return (
    <div
      data-testid="preview-banner"
      data-variant="claim"
      className="fixed bottom-[4.5rem] md:bottom-4 left-1/2 -translate-x-1/2 z-50 max-w-[calc(100vw-2rem)]"
      role="region"
      aria-label="Claim this property site"
    >
      <div className="flex items-center gap-3 md:gap-5 bg-ink text-warm-white pl-4 pr-2 py-2 md:pl-6 md:pr-3 md:py-3 rounded-full shadow-2xl border border-warm-white/10">
        <span className="hidden sm:inline-block w-1.5 h-1.5 rounded-full bg-gold animate-pulse" aria-hidden />
        <p className="text-[11px] md:text-xs leading-snug whitespace-nowrap">
          <span className="hidden md:inline text-warm-white/70 uppercase tracking-[0.25em] mr-2">
            Free preview
          </span>
          <span className="font-medium hidden sm:inline">Is this your listing? Activate the site, domain, and seller reports.</span>
          <span className="font-medium sm:hidden">Is this your listing?</span>
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

function ActivateBanner({
  address,
  listingId,
  token,
  onActivated,
}: Omit<ActivateProps, "slug" | "variant">) {
  const [state, setState] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [error, setError] = useState<string>("");

  async function activate() {
    setState("submitting");
    setError("");
    try {
      const res = await fetch(
        `${API_BASE}/api/listings/${encodeURIComponent(listingId)}/activate?token=${encodeURIComponent(token)}`,
        { method: "POST", headers: { "Content-Type": "application/json" } },
      );
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        domainName?: string;
        already?: boolean;
      };
      if (!res.ok) {
        setState("error");
        setError(typeof body.error === "string" ? body.error : "Activation failed.");
        return;
      }
      setState("success");
      onActivated?.();
    } catch (err) {
      setState("error");
      setError(err instanceof Error ? err.message : "Network error.");
    }
  }

  return (
    <div
      data-testid="preview-banner"
      data-variant="activate"
      className="fixed top-4 left-1/2 -translate-x-1/2 z-50 max-w-[calc(100vw-2rem)]"
      role="region"
      aria-label="Activate this property site"
    >
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-5 bg-ink text-warm-white px-5 py-3 md:px-7 md:py-4 rounded-full shadow-2xl border border-warm-white/10">
        <p className="text-[11px] md:text-xs leading-snug">
          <span className="hidden md:inline text-warm-white/70 uppercase tracking-[0.25em] mr-2">
            {state === "success" ? "Site is live" : "Your preview"}
          </span>
          <span className="font-medium">
            {state === "success"
              ? `${shortAddress(address)} is now live.`
              : `Ready to publish ${shortAddress(address)}?`}
          </span>
        </p>
        {state !== "success" ? (
          <button
            type="button"
            onClick={activate}
            disabled={state === "submitting"}
            data-testid="preview-banner-activate"
            className="shrink-0 inline-flex items-center justify-center h-9 md:h-10 px-4 md:px-5 rounded-full bg-gold text-ink text-[11px] md:text-xs font-semibold uppercase tracking-[0.2em] hover:bg-gold/90 transition-colors disabled:opacity-60"
          >
            {state === "submitting" ? "Activating…" : "Activate this site"}
          </button>
        ) : (
          <span
            data-testid="preview-banner-success"
            className="shrink-0 inline-flex items-center justify-center h-9 md:h-10 px-4 md:px-5 rounded-full bg-emerald-500/20 text-emerald-200 text-[11px] md:text-xs font-semibold uppercase tracking-[0.2em]"
          >
            Live ✓
          </span>
        )}
      </div>
      {state === "error" && error && (
        <p
          data-testid="preview-banner-error"
          className="mt-2 mx-auto max-w-md text-center text-[11px] text-red-200 bg-red-900/60 border border-red-700/50 rounded-full px-4 py-2"
        >
          {error}
        </p>
      )}
    </div>
  );
}

function shortAddress(addr: string): string {
  return addr.split(",")[0]?.trim() || addr;
}
