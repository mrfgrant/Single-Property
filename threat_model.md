# Threat Model

## Project Overview

PropSite is a TypeScript pnpm monorepo for a real-estate SaaS. The production system consists primarily of an Express 5 API server (`artifacts/api-server`) plus two React/Vite frontends: a public marketing/listing site (`artifacts/marketing-site`) and a password-protected admin app (`artifacts/admin`). The API talks directly to PostgreSQL through Drizzle ORM, Replit Object Storage, Stripe, Cloudflare, Telnyx, Resend, and an MLS/RESO feed.

Production assumption: `NODE_ENV=production`, TLS is handled by the platform, and `artifacts/mockup-sandbox` is dev-only unless production reachability is later demonstrated.

## Assets

- **Agent accounts and bearer-style magic links** — `magicLinkToken` values authorize profile reads/updates, listing creation, seller-email changes, activation, and billing-portal access. Compromise enables account takeover for an agent workflow.
- **Admin capabilities and infrastructure control** — admin routes can manage listings, domains, DNS records, outreach data, and operational dashboards. Compromise can alter customer content or Cloudflare-managed domains.
- **Listing and lead data** — listings, seller emails, buyer leads, click events, and analytics contain contact information and business-sensitive sales activity.
- **Billing state** — Stripe customer IDs, subscription IDs, and webhook-triggered state changes determine whether listing sites go live or are disabled.
- **Private object storage contents** — uploaded photos, logos, headshots, and any future private files stored under `PRIVATE_OBJECT_DIR`.
- **Third-party integration authority** — Cloudflare, Stripe, Telnyx, Resend, and MLS credentials allow domain changes, billing actions, messaging, email, and data ingestion.

## Trust Boundaries

- **Browser/mobile client to API** — all request bodies, params, headers, and uploaded files are attacker-controlled. The client cannot enforce auth, role checks, or business rules.
- **API to PostgreSQL** — the API has broad read/write access to listings, agents, leads, analytics, and operational records.
- **API to object storage** — the server can mint signed upload URLs and proxy private objects back to clients.
- **API to external providers** — Stripe, Telnyx, Cloudflare, MLS, and Resend calls cross into third-party systems and require signature validation, secret handling, and outbound request discipline.
- **Public vs authenticated vs operator surfaces** — public routes include health, onboarding, leads, preview listing reads, analytics ingest, storage, and webhook endpoints; agent routes use magic-link bearer tokens; operator routes use custom admin bearer checks.
- **Shared vs dev-only code** — `artifacts/api-server`, `artifacts/marketing-site`, `artifacts/admin`, and `lib/db` are production-relevant. `artifacts/mockup-sandbox` is out of scope by default.

## Scan Anchors

- **Production entry points**: `artifacts/api-server/src/app.ts`, `artifacts/api-server/src/routes/*.ts`, `artifacts/api-server/src/index.ts`.
- **Highest-risk code areas**: `src/routes/activation.ts`, `src/routes/agents.ts`, `src/routes/admin*.ts`, `src/routes/domainAdmin.ts`, `src/routes/storage.ts`, `src/routes/webhookStripe.ts`, `src/routes/webhookTelnyx.ts`, `src/lib/cloudflare/`, `src/lib/objectStorage.ts`, `src/lib/stripe/`.
- **Public surfaces**: onboarding, leads, preview listing reads, analytics ingest, storage endpoints, click tracking, waitlist, webhooks.
- **Authenticated/operator surfaces**: custom admin bearer routes and magic-link agent routes.
- **Dev-only areas usually to ignore**: `artifacts/mockup-sandbox`, seed helpers unless they influence production behavior.

## Threat Categories

### Spoofing

The application uses two custom auth mechanisms: a static admin bearer secret and long-lived agent magic-link tokens. The system must authenticate every privileged route server-side, reject missing or invalid credentials, and enforce token lifetime where expiry is stored. Webhook endpoints must verify provider signatures and fail closed in production when required secrets are missing.

### Tampering

Attackers can submit arbitrary JSON, query parameters, and file uploads to the API. Public endpoints must not allow mutation of admin-managed listings, DNS, or billing state. Domain/DNS operations and listing activation must be bound to authenticated principals with server-side ownership checks.

### Information Disclosure

Listing, lead, analytics, and object-storage data cross public and private boundaries. Public endpoints must return only intended fields, private object-storage paths must not be fetchable without authorization, and operational/admin endpoints must not expose sensitive records or infrastructure state to unauthenticated callers.

### Denial of Service

The API exposes public endpoints that can enqueue emails, upload files, generate signed URLs, and hit external providers. Publicly reachable heavy operations must avoid becoming anonymous storage, email, or provider-abuse channels, and sensitive write paths must not be triggerable without authentication.

### Elevation of Privilege

The highest-impact risks are broken access control on admin or agent routes, fail-open webhook logic, and misuse of private storage. The system must ensure that only operators can reach admin capabilities, only the owning agent can act on their listings, and no public route can escalate into Cloudflare, billing, or infrastructure control.