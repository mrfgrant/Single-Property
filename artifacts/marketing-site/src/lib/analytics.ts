type AnalyticsEvent = "cta_click" | "see_example_click" | "scroll_depth";

interface EventProperties {
  label?: string;
  depth?: number;
}

export function track(event: AnalyticsEvent, props?: EventProperties): void {
  if (typeof window === "undefined") return;
  if (import.meta.env.DEV) {
    console.info("[analytics]", event, props ?? {});
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
