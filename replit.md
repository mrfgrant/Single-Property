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

## Critical: api-zod export pattern

`lib/api-zod/src/index.ts` must only do `export * from "./generated/api"`.
Do NOT add `export * from "./generated/types"` — the types directory has TypeScript interfaces
with the same names as the Zod schemas and will cause TS2308 ambiguity errors. Zod schemas
serve as both runtime validators and type sources via `z.infer<>`.

## Artifacts

### `artifacts/marketing-site` — SEO / GEO

- `index.html` — base meta + OG/Twitter + geo (`US-GA`, Augusta lat/lon) + JSON-LD `@graph`
  with `SoftwareApplication`, `Organization`, `WebSite`, `Service`, `HowTo`, `FAQPage`.
- `public/robots.txt` — allow-all + explicit allow for major AI crawlers (GPTBot, ClaudeBot,
  PerplexityBot, Google-Extended, Applebot-Extended, etc.). Disallows `/onboarding/success`
  (tokenized URL). Links sitemap.
- `public/sitemap.xml` — home, /onboarding, demo listing.
- `public/llms.txt` + `public/llms-full.txt` — GEO files for ChatGPT / Claude / Perplexity
  ingestion (llms.txt spec: H1 + blockquote summary + sections).
- `src/lib/seo.ts` — `applySeoFromCopy()` (home), `setPageSeo({title, description, path,
  image?, index?})` (per-route), `injectJsonLd(id, schema)` returning a cleanup fn for
  per-page Schema.org (RealEstate `Product`+`Residence` + `BreadcrumbList` on Listing).
- Per-page SEO calls live in: `pages/Onboarding.tsx`, `pages/OnboardingSuccess.tsx` (noindex
  due to magic token in URL), `pages/Listing.tsx` (dynamic title/description/JSON-LD per
  listing).

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
- `src/routes/adminDomains.ts` — domain search, standalone register, assign-to-listing, and DNS CRUD (A/TXT)

**MLS ingestion & data foundation** (Task #2 — built; live calls credential-gated):
- `src/lib/mls/config.ts` — env-driven config (`MLS_BASE_URL`, `MLS_ACCESS_TOKEN`, `MLS_BOARD_ID`, optional `MLS_DELTA_INTERVAL_MS`, `MLS_FULL_SYNC_ON_BOOT`, `MLS_PROPERTY_RESOURCE`, `MLS_MEDIA_RESOURCE`, `MLS_MAX_PHOTOS_PER_LISTING`). Includes `normalizeStatus()` and `isTerminalStatus()`.
- `src/lib/mls/client.ts` — typed RESO Web API (OData 4.0) client. `MlsClient.iterateProperties()` follows `@odata.nextLink` pagination; `fetchMediaForListing()` pulls photos. Throws `MlsNotConfiguredError` when env vars are missing — no live calls without credentials.
- `src/lib/mls/eventBus.ts` — typed in-process `EventEmitter` exporting `mlsEventBus`. Emits `listing.status_changed` and `listing.upserted`. Downstream tasks (#3 renderer, #4 billing) subscribe.
- `src/lib/mls/sync.ts` — `runSync('full' | 'delta')`, status diffing, watermark tracking via `mls_sync_state`, photo upsert keyed by `(listing_id, mls_media_key)`, mirrors photo URLs onto `listings.photoUrls` for renderer convenience.
- `src/lib/mls/cron.ts` — `startMlsIngestion()` boots the 15-min delta loop + optional boot-time full sync. No-op when MLS isn't configured (logs a clear warning).
- `src/routes/mls.ts` — `GET /api/mls/status` (public; returns config + last sync state + total ingested) and `POST /api/mls/sync?kind=full|delta` (admin Bearer; manual trigger).
- New schema files: `listingPhotos.ts`, `listingStatusEvents.ts`, `sites.ts`, `subscriptions.ts`, `mlsSyncState.ts`. Existing `listings` table gained `listAgentMlsId` (indexed), `listAgentName/Email/Phone`, `mlsStatus`, `mlsModificationTimestamp`, plus an index on `mlsListingId`. `agentId` is now nullable (MLS-ingested listings exist before an agent signs up — Task #4 backfills via MLS-ID match).

**Object storage** (Task #12 — built):
- `src/lib/objectStorage.ts` — `ObjectStorageService` class (GCS via Replit Object Storage)
- `src/lib/objectAcl.ts` — ACL policy helpers
- `src/routes/storage.ts` — presigned upload URL + object serving endpoints
- `src/routes/adminListings.ts` — full CRUD for `example_listings` + photo upload/delete
- `src/middleware/adminAuth.ts` — Bearer token check against `ADMIN_PASSWORD`

**DB schema** (`lib/db/src/schema/`):
- `automationRuns.ts` — `automation_runs` table: tracks every provisioning step
- `exampleListings.ts` — `example_listings` table: demo listings (now includes `domain_name` column)
- `standaloneDomains.ts` — `standalone_domains` table: domains registered without a listing
- `waitlistEntries.ts` — `waitlist_entries` table: email waitlist signups

**Routes**:
- `GET  /api/healthz`
- `POST /api/analytics/events`
- `GET  /api/admin/domains/runs`
- `GET  /api/admin/domains/runs/:id`
- `POST /api/admin/domains/provision`
- `POST /api/admin/domains/close`
- `GET  /api/admin/domains/registered`
- `POST /api/waitlist`
- `POST /api/agents/check-market`
- `GET  /api/listings/examples`
- `GET  /api/admin/listings` — requires Bearer ADMIN_PASSWORD
- `POST /api/admin/listings` — requires Bearer ADMIN_PASSWORD
- `PATCH /api/admin/listings/:id` — requires Bearer ADMIN_PASSWORD
- `DELETE /api/admin/listings/:id` — requires Bearer ADMIN_PASSWORD (soft-archives)
- `POST /api/admin/listings/:id/photos` — multipart upload, requires Bearer ADMIN_PASSWORD
- `DELETE /api/admin/listings/:id/photos/:index` — requires Bearer ADMIN_PASSWORD
- `GET  /api/admin/mls-lookup/:mlsId` — stub (MLS not yet connected)
- `POST /api/admin/domain/search` — check availability for a domain or auto-generate from address+city
- `POST /api/admin/domain/register` — register a domain standalone + ensure Cloudflare zone
- `POST /api/admin/domain/assign` — register + assign domain to an example listing
- `POST /api/admin/domain/unassign` — remove domain from an example listing
- `GET  /api/admin/domain/list` — list all managed domains (Cloudflare + local)
- `GET  /api/admin/domain/dns/:domain` — list DNS records for a domain zone
- `POST /api/admin/domain/dns/:domain` — add/update A or TXT record
- `DELETE /api/admin/domain/dns/:domain/:recordId` — delete a DNS record
- `POST /api/storage/uploads/request-url`
- `GET  /api/storage/public-objects/:filePath`
- `GET  /api/storage/objects/:objectPath`

### `artifacts/marketing-site`
React + Vite SaaS marketing homepage at `/`. The public-facing page real estate agents land on.
- Stack: React, Vite, Tailwind CSS v4, Framer Motion, Lucide React
- Fonts: Playfair Display (headings/display) + DM Sans (body/UI) via Google Fonts
- Palette: warm editorial luxury — `--ink #0e0e0e`, `--cream #f5f0e8`, `--warm-white #faf8f4`, `--gold #c9a84c`
- Single-page scroll: Nav → Hero → How It Works → Pricing → Comparison Table → Social Proof → CTA Banner → Footer
- All copy centralized in `src/lib/copy.ts`
- URL constants in `src/lib/config.ts`: `ONBOARDING_URL` and `DEMO_EXAMPLE_URL`
- Analytics: `src/lib/analytics.ts` tracks events, beacons to `POST /api/analytics/events`
- `src/data/sampleListings.ts` — 40 Augusta/CSRA sample listings
- `src/pages/Listing.tsx` — `/listing/:slug` individual property page

### `artifacts/admin`
React + Vite admin panel at `/admin/`. Password-protected operator tool for managing demo listings and domains.
- Top nav: Listings | Domain Search | Domains
- **Listings page**: table with domain column + Assign/Unassign buttons per row
- **Domain Search page**: search by candidate domain or address+city, see availability, register standalone or assign to listing
- **Domains page**: list all managed domains, click any to open DNS panel — add/edit/delete A and TXT records
- Auth: password stored in `sessionStorage`, sent as `Authorization: Bearer <token>` header
- Requires `ADMIN_PASSWORD` secret to be set

### `artifacts/mockup-sandbox`
Internal design prototyping sandbox — not a user-facing product.

## Project: Single Property Website Platform (SaaS)

Real estate agent SaaS that auto-builds a property marketing site for every MLS listing.

**Environment variables needed:**
- `CLOUDFLARE_API_TOKEN` — Zone:Edit + Registrar:Edit (set ✓)
- `CLOUDFLARE_ACCOUNT_ID` — Cloudflare account ID (set ✓)
- `ADMIN_PASSWORD` — protects admin panel at /admin/ (set ✓)
- `DEFAULT_OBJECT_STORAGE_BUCKET_ID` — Replit Object Storage bucket (set ✓)
- `PUBLIC_OBJECT_SEARCH_PATHS` — comma-separated GCS paths for public assets (set ✓)
- `PRIVATE_OBJECT_DIR` — GCS path prefix for uploaded objects (set ✓)
- `RESEND_API_KEY` — email delivery (set ✓)
- `STRIPE_SECRET_KEY` — Stripe billing (set ✓)
- `STRIPE_PUBLISHABLE_KEY` — Stripe billing (set ✓)
- `STRIPE_WEBHOOK_SECRET` — generated after first deploy + webhook registration
- `SITE_DEPLOYMENT_HOSTNAME` — production hostname for DNS CNAME records
- `PLATFORM_HOMEPAGE_URL` — fallback redirect for closed listings
- `TELNYX_API_KEY` — SMS outreach (Telnyx Messaging API v2 + Number Lookup)
- `TELNYX_MESSAGING_PROFILE_ID` — Telnyx messaging profile (preferred — selects sending number automatically)
- `TELNYX_FROM_NUMBER` — fallback E.164 number if no messaging profile
- `TELNYX_PUBLIC_KEY` — base64 SPKI Ed25519 public key for webhook signature verification (required in production)
- `COLD_OUTREACH_DELAY_MS` — optional, defaults to 15min delay between MLS event and outreach send
- `MARKETING_SITE_URL` — base URL for preview/onboarding links in cold outreach (defaults to https://app.propsite.io)
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
- #5 Leads, notifications & cold outreach — **BUILT** ✓ (in-process outbox workers; gated on Telnyx provisioning)
- #6 Analytics & weekly seller report — **BUILT** ✓ (custom in-DB tracker, no third-party SDKs; hourly cron emits Mon 8am local-TZ seller report via outbox; final marketing summary on Sold/Withdrawn/Expired; admin backfill route)
  - Schema: `analytics_events` (FK CASCADE on listings), `seller_reports_sent` (uniqueIndex on listing_id+week_start for idempotent dedupe).
  - Tracker: `<2 KB`, sessionStorage UUID, batched + sendBeacon flush, idle 5min session_end.
  - Server derives source/device/geo from request headers (Cloudflare cf-ipcity / x-vercel-* / x-forwarded-for); IP hashed via daily-rotating HMAC. ZIP→IANA TZ for week boundaries (default America/New_York).
  - Env vars: `ANALYTICS_HASH_SECRET` (falls back to SESSION_SECRET / STRIPE_WEBHOOK_SECRET; fail-closed in prod). Optional: `WEEKLY_REPORT_TICK_MS` (default 1h), `WEEKLY_REPORT_CRON_DISABLED=1` to opt out.
- #7 Marketing site — **BUILT** ✓
- #8 SEO metadata — **BUILT** ✓
- #9 Wire up CTAs — pending #4
- #10 Interactive listing demo — **BUILT** ✓
- #11 Regional scope & waitlist — **BUILT** ✓
- #12 Admin panel — **BUILT** ✓
- #13 Admin domain search & DNS manager — **BUILT** ✓
