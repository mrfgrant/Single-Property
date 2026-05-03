/**
 * Lightweight analytics tracker for property sites.
 *
 * Design constraints (per Task #6 spec):
 *   - <2 KB on the wire (no third-party SDKs).
 *   - Batches events and flushes via sendBeacon on session_end so that
 *     leaving the page doesn't drop trailing events.
 *   - Server-side derives geo / source / device from headers; we send
 *     only what the browser knows: listing id, session id, event type,
 *     referrer, utm_source, photo index, page path.
 *   - sessionStorage for sessionId so a single tab/visit collapses into
 *     one session even across pageviews.
 *
 * The legacy marketing-page tracker (`cta_click`, `scroll_depth`) still
 * works — it short-circuits to a console log and never reaches the
 * /analytics/events ingest route, so it doesn't pollute property-site
 * analytics with marketing-site interactions.
 */

const ANALYTICS_ENDPOINT = "/api/analytics/events";

type LegacyEvent = "cta_click" | "see_example_click" | "scroll_depth";
type PropertyEventType =
  | "pageview"
  | "session_start"
  | "session_end"
  | "gallery_photo_view"
  | "lead_submitted";

interface PropertyEvent {
  listingId: string;
  sessionId: string;
  eventType: PropertyEventType;
  occurredAt: string;
  referrer?: string | null;
  utmSource?: string | null;
  photoIndex?: number | null;
  path?: string | null;
}

declare global {
  interface Window {
    dataLayer?: unknown[];
  }
}

interface LegacyProps {
  label?: string;
  depth?: number;
}

/** Legacy marketing-site track — left intact for the existing landing-page hooks. */
export function track(event: LegacyEvent, props?: LegacyProps): void {
  if (typeof window === "undefined") return;
  console.info("[analytics]", event, props ?? {});
  window.dataLayer = window.dataLayer ?? [];
  window.dataLayer.push({ event, ...props });
  window.dispatchEvent(
    new CustomEvent("propsite:track", { detail: { event, ...props } }),
  );
}

const SESSION_KEY = "propsite:sid";
const QUEUE: PropertyEvent[] = [];
let flushTimer: number | null = null;

function getSessionId(): string {
  if (typeof window === "undefined") return "ssr";
  try {
    const existing = window.sessionStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const fresh = generateSessionId();
    window.sessionStorage.setItem(SESSION_KEY, fresh);
    return fresh;
  } catch {
    return generateSessionId();
  }
}

function generateSessionId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function getUtmSource(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return new URL(window.location.href).searchParams.get("utm_source");
  } catch {
    return null;
  }
}

function flush(useBeacon = false): void {
  if (typeof window === "undefined" || QUEUE.length === 0) return;
  const events = QUEUE.splice(0, QUEUE.length);
  const payload = JSON.stringify({ events });
  try {
    if (useBeacon && typeof navigator.sendBeacon === "function") {
      navigator.sendBeacon(
        ANALYTICS_ENDPOINT,
        new Blob([payload], { type: "application/json" }),
      );
      return;
    }
    fetch(ANALYTICS_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Swallow — analytics is best-effort and must never break the page.
  }
}

function scheduleFlush(): void {
  if (flushTimer !== null) return;
  flushTimer = window.setTimeout(() => {
    flushTimer = null;
    flush(false);
  }, 1500);
}

function enqueue(event: PropertyEvent): void {
  QUEUE.push(event);
  // Flush immediately if queue is getting large; otherwise debounce.
  if (QUEUE.length >= 10) {
    flush(false);
  } else {
    scheduleFlush();
  }
}

/**
 * Initialize tracking for a property site. Returns an unsubscribe to
 * stop listening (used in dev under HMR). Safe to call with a falsy
 * listingId — if there's no real listing row in our DB (e.g. an
 * example/demo slug) the server drops events silently, so we still
 * register the lifecycle hooks but the data never lands.
 */
export function initListingAnalytics(listingId: string | null | undefined): () => void {
  if (typeof window === "undefined" || !listingId) {
    return () => {};
  }
  const sessionId = getSessionId();
  const referrer = document.referrer || null;
  const utmSource = getUtmSource();
  const path = window.location.pathname;

  const isFreshSession = !window.sessionStorage.getItem(`${SESSION_KEY}:started:${listingId}`);
  if (isFreshSession) {
    enqueue({
      listingId,
      sessionId,
      eventType: "session_start",
      occurredAt: new Date().toISOString(),
      referrer,
      utmSource,
      path,
    });
    try {
      window.sessionStorage.setItem(`${SESSION_KEY}:started:${listingId}`, "1");
    } catch {
      /* ignore */
    }
  }

  enqueue({
    listingId,
    sessionId,
    eventType: "pageview",
    occurredAt: new Date().toISOString(),
    referrer,
    utmSource,
    path,
  });

  // Idle session_end after 5 min of inactivity.
  const IDLE_MS = 5 * 60 * 1000;
  let idleTimer: number | null = null;
  let ended = false;
  const sendSessionEnd = (useBeacon: boolean): void => {
    if (ended) return;
    ended = true;
    enqueue({
      listingId,
      sessionId,
      eventType: "session_end",
      occurredAt: new Date().toISOString(),
      path,
    });
    flush(useBeacon);
  };
  const resetIdle = (): void => {
    if (ended) return;
    if (idleTimer !== null) window.clearTimeout(idleTimer);
    idleTimer = window.setTimeout(() => sendSessionEnd(false), IDLE_MS);
  };
  resetIdle();
  const activityEvents: Array<keyof WindowEventMap> = ["pointerdown", "scroll", "keydown"];
  for (const ev of activityEvents) {
    window.addEventListener(ev, resetIdle, { passive: true });
  }

  const onVisibility = (): void => {
    if (document.visibilityState === "hidden") {
      sendSessionEnd(true);
    }
  };
  const onPageHide = (): void => sendSessionEnd(true);
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("pagehide", onPageHide);

  return () => {
    if (idleTimer !== null) window.clearTimeout(idleTimer);
    for (const ev of activityEvents) {
      window.removeEventListener(ev, resetIdle);
    }
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("pagehide", onPageHide);
  };
}

export function trackPhotoView(listingId: string | null | undefined, photoIndex: number): void {
  if (!listingId) return;
  enqueue({
    listingId,
    sessionId: getSessionId(),
    eventType: "gallery_photo_view",
    occurredAt: new Date().toISOString(),
    photoIndex,
    path: typeof window !== "undefined" ? window.location.pathname : null,
  });
}

export function trackLeadSubmitted(listingId: string | null | undefined): void {
  if (!listingId) return;
  enqueue({
    listingId,
    sessionId: getSessionId(),
    eventType: "lead_submitted",
    occurredAt: new Date().toISOString(),
    path: typeof window !== "undefined" ? window.location.pathname : null,
  });
  // Lead submit is high-value — flush right away so we don't lose it
  // if the user navigates away.
  flush(false);
}

/** Legacy scroll-depth tracker still used by the marketing landing page. */
export function initScrollDepth(): () => void {
  const milestones = [25, 50, 75, 90];
  const fired = new Set<number>();
  const handler = () => {
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    if (docHeight <= 0) return;
    const scrollPercent = Math.round((window.scrollY / docHeight) * 100);
    for (const m of milestones) {
      if (scrollPercent >= m && !fired.has(m)) {
        fired.add(m);
        track("scroll_depth", { depth: m });
      }
    }
  };
  window.addEventListener("scroll", handler, { passive: true });
  return () => window.removeEventListener("scroll", handler);
}
