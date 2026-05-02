# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

## Artifacts

### `artifacts/api-server`
Express 5 API server. Serves all backend routes. No frontend.

### `artifacts/marketing-site`
React + Vite SaaS marketing homepage at `/`. The public-facing page real estate agents land on before signing up.
- Stack: React, Vite, Tailwind CSS v4, Framer Motion, Lucide React
- Fonts: Playfair Display (headings/display) + DM Sans (body/UI) via Google Fonts
- Palette: warm editorial luxury — `--ink #0e0e0e`, `--cream #f5f0e8`, `--warm-white #faf8f4`, `--gold #c9a84c`
- Single-page scroll: Nav → Hero (mock browser preview) → How It Works → Pricing → Comparison Table → Social Proof → CTA Banner → Footer
- All copy centralized in `src/lib/copy.ts` — PLATFORM_NAME, WORDMARK_PREFIX/SUFFIX, PAGE_TITLE, PAGE_DESCRIPTION, and all section copy (HERO, HOW_IT_WORKS, PRICING, COMPARISON, SOCIAL_PROOF, CTA_BANNER, NAV)
- URL constants in `src/lib/config.ts`: `ONBOARDING_URL = "https://app.propsite.io/onboarding"` and `DEMO_EXAMPLE_URL = "https://demo.propsite.io"` — both are stubs to be updated to real URLs once Task #3 (property renderer) and Task #4 (onboarding/Stripe) are complete
- CTA buttons navigate externally to ONBOARDING_URL (no scroll-intercept); "See a live example" links open DEMO_EXAMPLE_URL in a new tab
- Analytics: `src/lib/analytics.ts` tracks `cta_click`, `see_example_click`, `scroll_depth` events; beacons to `POST /api/analytics/events` on the API server; also pushes to `window.dataLayer` for GTM and dispatches `propsite:track` CustomEvent
- SMS removed from all copy per platform-owner decision; copy uses email-only lead alerts

### `artifacts/mockup-sandbox`
Internal design prototyping sandbox — not a user-facing product.

## Project: Single Property Website Platform (SaaS)

Real estate agent SaaS that auto-builds a property marketing site for every MLS listing. Six planned tasks beyond the marketing site:
1. IONOS domain & DNS automation
2. MLS ingestion & data foundation
3. Property site renderer (preview SSR + live static via Object Storage)
4. Agent onboarding & Stripe billing ($49/mo per active listing)
5. Leads, notifications & cold outreach (email only — no SMS)
6. Analytics & weekly seller report
