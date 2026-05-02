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
- `cd lib/db && npx tsc -p tsconfig.json` — rebuild DB declaration files after schema changes (required before api-server typecheck)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

## Artifacts

### `artifacts/api-server`
Express 5 API server. Serves all backend routes. No frontend.

**Cloudflare domain automation** (Task #1 — built):
- `src/lib/cloudflare/` — all Cloudflare modules
  - `client.ts` — base fetch wrapper with Bearer auth, error handling
  - `domainGenerator.ts` — `[number][streetname].com` formula + DNS availability check
  - `registrar.ts` — Cloudflare Registrar API (register, get, list, disable auto-renew)
  - `dns.ts` — zone management + CNAME/A/TXT record upsert (proxied = Universal SSL)
  - `redirectRules.ts` — Cloudflare Redirect Rules API for listing-close 301s
  - `orchestrator.ts` — `provisionDomainForListing()` — idempotent, step-persisted end-to-end
  - `lifecycle.ts` — `handleListingClosed()` — flips domain to 301 redirect on Sold/Withdrawn/Expired
  - `index.ts` — barrel export
- `src/routes/domainAdmin.ts` — operator-only CRUD: list runs, provision, close listing, list registered
- Admin routes protected by `ADMIN_TOKEN` env var (if set); no auth if unset (MVP)

**DB schema** (`lib/db/src/schema/`):
- `automationRuns.ts` — `automation_runs` table: tracks every provisioning step with Cloudflare IDs, status, errors

**Routes**:
- `GET /api/healthz`
- `POST /api/analytics/events`
- `GET /api/admin/domains/runs`
- `GET /api/admin/domains/runs/:id`
- `POST /api/admin/domains/provision` — `{ listingId, address, city }`
- `POST /api/admin/domains/close` — `{ listingId, status, agentWebsiteUrl? }`
- `GET /api/admin/domains/registered`

### `artifacts/marketing-site`
React + Vite SaaS marketing homepage at `/`. The public-facing page real estate agents land on before signing up.
- Stack: React, Vite, Tailwind CSS v4, Framer Motion, Lucide React
- Fonts: Playfair Display (headings/display) + DM Sans (body/UI) via Google Fonts
- Palette: warm editorial luxury — `--ink #0e0e0e`, `--cream #f5f0e8`, `--warm-white #faf8f4`, `--gold #c9a84c`
- Single-page scroll: Nav → Hero (mock browser preview) → How It Works → Pricing → Comparison Table → Social Proof → CTA Banner → Footer
- All copy centralized in `src/lib/copy.ts`
- URL constants in `src/lib/config.ts`: `ONBOARDING_URL` and `DEMO_EXAMPLE_URL` — stubs until Tasks #3 and #4 are live
- Analytics: `src/lib/analytics.ts` tracks events, beacons to `POST /api/analytics/events`

### `artifacts/mockup-sandbox`
Internal design prototyping sandbox — not a user-facing product.

## Project: Single Property Website Platform (SaaS)

Real estate agent SaaS that auto-builds a property marketing site for every MLS listing.

**Environment variables needed:**
- `CLOUDFLARE_API_TOKEN` — Zone:Edit + Registrar:Edit (set ✓)
- `CLOUDFLARE_ACCOUNT_ID` — Cloudflare account ID (set ✓)
- `SITE_DEPLOYMENT_HOSTNAME` — production deployment hostname for DNS CNAME records (set after first deploy)
- `PLATFORM_HOMEPAGE_URL` — fallback redirect for closed listings (set ✓: propsite.app)
- `ADMIN_TOKEN` — protects admin API routes (optional; no auth if unset)
- `STRIPE_SECRET_KEY` — Stripe billing
- `STRIPE_PUBLISHABLE_KEY` — Stripe billing
- `STRIPE_WEBHOOK_SECRET` — generated after first deploy + webhook registration
- `TELNYX_API_KEY` — SMS outreach
- `TELNYX_PHONE_NUMBER` — outbound SMS number
- `FRED_API_KEY` — mortgage rate data

**Important workflow:**
After any `lib/db/src/schema/` change:
1. `pnpm --filter @workspace/db run push` — apply to Postgres
2. `cd lib/db && npx tsc -p tsconfig.json` — rebuild declarations
3. Then `pnpm --filter @workspace/api-server run typecheck` — verify

## Task Status
- #1 Cloudflare domain & DNS automation — **BUILT** ✓
- #2 MLS ingestion — blocked (awaiting MLS credentials from Augusta Board of REALTORS)
- #3 Property site renderer — blocked on #2
- #4 Agent onboarding & Stripe billing — in progress
- #5 Leads, notifications & cold outreach — pending #2
- #6 Analytics & weekly seller report — pending #2, #3, #5
- #7 Marketing site — MERGED ✓
- #8 SEO metadata — pending
- #9 Wire up CTAs — pending #4
- #10 Interactive listing demo — pending
- #11 Regional scope & waitlist — pending
- #12 Admin panel — pending
