type AnalyticsEvent = "cta_click" | "see_example_click" | "scroll_depth";

interface EventProperties {
  label?: string;
  depth?: number;
}

declare global {
  interface Window {
    dataLayer?: unknown[];
  }
}

const ANALYTICS_ENDPOINT = "/api/analytics/events";

export function track(event: AnalyticsEvent, props?: EventProperties): void {
  if (typeof window === "undefined") return;

  console.info("[analytics]", event, props ?? {});

  window.dataLayer = window.dataLayer ?? [];
  window.dataLayer.push({ event, ...props });

  window.dispatchEvent(
    new CustomEvent("propsite:track", { detail: { event, ...props } }),
  );

  try {
    const payload = JSON.stringify({ event, ...props });
    if (typeof navigator.sendBeacon === "function") {
      navigator.sendBeacon(
        ANALYTICS_ENDPOINT,
        new Blob([payload], { type: "application/json" }),
      );
    } else {
      fetch(ANALYTICS_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
        keepalive: true,
      }).catch(() => {});
    }
  } catch {
  }
}

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
