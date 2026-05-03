import { PAGE_TITLE, PAGE_DESCRIPTION } from "./copy";

const CANONICAL_ORIGIN = "https://app.propsite.io";
const DEFAULT_OG_IMAGE = `${CANONICAL_ORIGIN}/og-image.png`;

function setMeta(selector: string, value: string) {
  const el = document.head.querySelector<HTMLMetaElement>(selector);
  if (el) {
    el.setAttribute("content", value);
  }
}

function setOrCreateMeta(attr: "name" | "property", key: string, value: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", value);
}

function setCanonical(url: string) {
  let el = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", "canonical");
    document.head.appendChild(el);
  }
  el.setAttribute("href", url);
}

/**
 * Re-applies the homepage SEO copy from the canonical source (lib/copy.ts).
 * Use this on Home mount so SPA navigation back from noindex pages
 * (e.g. /onboarding/success) restores `index, follow` and resets
 * og:url / og:image to the homepage values.
 */
export function applySeoFromCopy() {
  setPageSeo({
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
    path: "/",
  });
}

interface PageSeoOptions {
  title: string;
  description: string;
  /** Path-only (e.g. "/onboarding") — origin is added automatically. */
  path: string;
  /** Optional absolute image URL for OG/Twitter preview. */
  image?: string;
  /** Defaults to true. Set false for tokenized URLs (e.g. success page). */
  index?: boolean;
}

/**
 * Sets per-route title/description/canonical/OG/Twitter and indexability.
 * Call from a `useEffect` on each top-level page that isn't the home page.
 */
export function setPageSeo(opts: PageSeoOptions) {
  const url = `${CANONICAL_ORIGIN}${opts.path}`;
  document.title = opts.title;
  setOrCreateMeta("name", "description", opts.description);
  setCanonical(url);

  setOrCreateMeta("property", "og:title", opts.title);
  setOrCreateMeta("property", "og:description", opts.description);
  setOrCreateMeta("property", "og:url", url);
  // Always set image — fall back to default so we never leak a stale image
  // from a previously-rendered page after SPA navigation.
  setOrCreateMeta("property", "og:image", opts.image ?? DEFAULT_OG_IMAGE);

  setOrCreateMeta("name", "twitter:title", opts.title);
  setOrCreateMeta("name", "twitter:description", opts.description);
  setOrCreateMeta("name", "twitter:image", opts.image ?? DEFAULT_OG_IMAGE);

  setOrCreateMeta(
    "name",
    "robots",
    opts.index === false ? "noindex, nofollow" : "index, follow",
  );
}

/**
 * Inject (or replace) a JSON-LD schema block keyed by id. Returns a
 * cleanup function suitable for `useEffect` return.
 */
export function injectJsonLd(id: string, schema: object): () => void {
  const elementId = `jsonld-${id}`;
  let el = document.getElementById(elementId) as HTMLScriptElement | null;
  if (!el) {
    el = document.createElement("script");
    el.type = "application/ld+json";
    el.id = elementId;
    document.head.appendChild(el);
  }
  el.textContent = JSON.stringify(schema);
  return () => {
    const cur = document.getElementById(elementId);
    cur?.parentElement?.removeChild(cur);
  };
}
