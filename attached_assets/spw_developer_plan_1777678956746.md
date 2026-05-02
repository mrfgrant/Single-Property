# Single Property Website Platform — Developer Brief
**Version:** 1.0  
**Prepared for:** Developer Review  
**Project type:** SaaS — Automated Real Estate Marketing Platform  
**Core promise:** Agent sets up once. Every listing gets a full marketing website automatically. Zero ongoing agent involvement required.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Core User Flow](#2-core-user-flow)
3. [MLS Integration & Automation Engine](#3-mls-integration--automation-engine)
4. [Agent Onboarding](#4-agent-onboarding)
5. [Property Website — Auto-Build Spec](#5-property-website--auto-build-spec)
6. [Domain Management](#6-domain-management)
7. [Lead Capture & Notifications](#7-lead-capture--notifications)
8. [Seller Weekly Report](#8-seller-weekly-report)
9. [Cold Outreach Automation](#9-cold-outreach-automation)
10. [Analytics & Dashboard](#10-analytics--dashboard)
11. [Billing & Subscription](#11-billing--subscription)
12. [Notifications Reference](#12-notifications-reference)
13. [Tech Stack Considerations](#13-tech-stack-considerations)
14. [MVP Scope vs Phase 2](#14-mvp-scope-vs-phase-2)
15. [Open Questions for Developer](#15-open-questions-for-developer)

---

## 1. Project Overview

### What this is
A fully automated single property website platform targeted at real estate agents. The platform monitors a local MLS feed, detects new listings, and automatically generates a dedicated property marketing website — complete with a custom domain, neighborhood content, lead capture, and weekly seller reporting — without any action required from the agent after initial setup.

### What makes this different from competitors
| Feature | Us | Competitors (Rela, CribFlyer, PhotoUp) |
|---|---|---|
| Agent effort per listing | Zero | Upload photos, write content, buy domain |
| MLS-triggered automation | Yes | No |
| Cold outreach on new listings | Yes — site built before agent is even contacted | No |
| Seller-facing weekly report | Auto-sent, no agent involvement | Manual or unavailable |
| Pricing | One flat fee, everything included | Tiered, domain add-ons, per-feature |
| Agent onboarding time | ~90 seconds, never log in again | Ongoing per-listing setup |

### Business model
- **$49/month per active listing** — flat, no tiers, no add-ons
- Billing starts when agent activates a site
- Billing stops automatically when MLS status changes to Sold/Withdrawn/Expired
- No contracts, cancel anytime

---

## 2. Core User Flow

### Flow A — Cold outreach to new agents (primary acquisition)
```
New listing detected on MLS feed
        ↓
Check if listing agent is already a paying customer
        ↓ (No)
Auto-generate a preview property website (unpublished/watermarked)
        ↓
Send cold outreach email to agent: "Your site for [address] is ready — claim it"
        ↓
Agent clicks link → lands on preview with "Activate for $49/month" CTA
        ↓
Agent completes 90-second onboarding + payment
        ↓
Site goes live, domain registered, seller report enabled
```

### Flow B — Existing agent auto-build (recurring)
```
New listing detected on MLS feed
        ↓
Agent ID matched to existing paying account
        ↓
Site auto-built and published immediately (no agent action)
        ↓
Agent receives text + email: "Your site for [address] is live — [URL]"
        ↓
Weekly seller reports auto-send every Monday
        ↓
MLS status changes to Sold/Withdrawn/Expired
        ↓
Site archives, billing stops, final report sent
```

---

## 3. MLS Integration & Automation Engine

### MLS data access
- Platform owner is a licensed broker with direct MLS access
- MLS feed format: **RESO Web API**
- Fields required per listing:
  - `ListingKey` / `ListingID`
  - `ListAgentMlsId` / `ListAgentEmail` / `ListAgentPhone`
  - `ListAgentFirstName` / `ListAgentLastName`
  - `UnparsedAddress`, `City`, `StateOrProvince`, `PostalCode`
  - `ListPrice`
  - `BedroomsTotal`, `BathroomsTotalInteger`
  - `LivingArea` (sq ft)
  - `PublicRemarks`
  - `Media` (photo URLs)
  - `StandardStatus` (Active, Pending, Sold, Withdrawn, Expired)
  - `ListingContractDate` / `OriginalEntryTimestamp`
  - `MlsStatus`

### Polling / webhook strategy
- **Preferred:** MLS webhook or change feed if supported by local MLS
- **Fallback:** Poll MLS API every 15 minutes for status changes and new listings
- Monitor `StandardStatus` changes to trigger site archiving

### Event triggers
| MLS Event | System Action |
|---|---|
| New listing — `StandardStatus: Active` | Build site, send cold outreach (if agent not customer) OR auto-publish (if existing customer) |
| Status → `Pending` | Update site banner: "Under Contract" |
| Status → `Sold` | Archive site, stop billing, send final report |
| Status → `Withdrawn` or `Expired` | Archive site, stop billing |
| Price change | Auto-update listing price on site |
| New photos added | Auto-refresh photo gallery |

---

## 4. Agent Onboarding

### Onboarding form — fields
Agents complete this once. They should never need to touch it again.

| Field | Required | Notes |
|---|---|---|
| First name | Yes | Used in email signatures, site contact |
| Last name | Yes | |
| Email address | Yes | Lead alerts, account comms |
| Phone number | Yes | Displayed on property sites, lead alert calls |
| MLS Agent ID | Yes | Used to match their listings in feed |
| Headshot photo | No | Displayed on property sites. Drag and drop upload |
| Brokerage name | No | Displayed on site footer |
| Logo upload | No | Optional branding on sites |

### Post-onboarding
- Account created, MLS ID stored
- Stripe payment method collected (Stripe Checkout preferred)
- Confirmation email sent with: what to expect, sample site preview, support contact
- Agent should **never need to log in again** unless they want to update their profile

### Agent portal (minimal — Phase 2 priority)
- View active listings and their URLs
- Update profile info / headshot
- View billing history
- The portal is **not** required for the product to work — it is supplementary

---

## 5. Property Website — Auto-Build Spec

### What gets built automatically
Every property website must include the following, generated from MLS data + external APIs with zero agent input:

#### Hero section
- Full-width photo gallery (pulled from MLS media URLs)
- Property address as headline
- Price, beds, baths, square footage
- "Schedule a Showing" CTA button → lead capture form

#### Property details
- Full MLS description (`PublicRemarks`)
- Structured feature list: bed/bath/sqft/garage/year built/lot size
- Map embed (Google Maps or Mapbox) centered on property

#### Neighborhood content (auto-generated)
- **School data:** Pull from GreatSchools API or NCES using ZIP/address
- **Walk Score / Bike Score / Transit Score:** Walk Score API
- **Nearby POIs:** Google Places API — restaurants, grocery, parks within 1 mile
- **Local market snapshot:** Median list price, avg days on market for ZIP code (pull from MLS or Zillow API)
- **Neighborhood blurb:** Auto-generated using property address + neighborhood name. Can use a template or LLM generation.

#### Agent contact section
- Agent headshot, name, phone, email, brokerage
- Lead capture form: Name, Email, Phone, Message
- Click-to-call phone link (critical for mobile)

#### Footer
- Property website URL
- Disclaimer / Fair Housing logo
- Powered by [Platform Name] (small, tasteful)

### SEO — auto-applied on every site
- Page title: `[Address] — [City] Home for Sale | [Agent Name]`
- Meta description auto-generated from listing details
- Schema.org `RealEstateListing` structured data markup
- Open Graph tags for social sharing previews
- Image alt tags from listing data
- Fast page load is critical — target under 2 seconds on mobile (images should be compressed/lazy-loaded)

### QR code & print assets (auto-generated, emailed to agent)
- QR code linking to property URL — PNG, print-ready resolution
- Sign rider graphic: 6"×2" horizontal layout, address + QR code — exported as PDF
- Social share card: 1080×1080 square with property photo + price overlay — PNG for Instagram/Facebook

---

## 6. Domain Management

### Strategy
- Auto-register a street-address domain for every active listing
- Format: `[streetnumber][streetname][city].com` — e.g., `412magnoliadrive.com`
- Fallback if taken: append city — `412magnoliadriveaugusta.com`
- Domain registered under platform account (not agent's account)
- Domain DNS pointed to property site automatically
- SSL certificate provisioned automatically (Let's Encrypt or Cloudflare)

### Domain lifecycle
| Stage | Action |
|---|---|
| Listing goes active | Domain registered, DNS configured, SSL provisioned |
| Listing sold/withdrawn | Domain kept for 90 days (redirect to agent's general website or platform homepage), then released |
| Agent does not activate | Preview site stays on platform subdomain (no custom domain purchased) |

### Domain registrar
- **IONOS Registrar API** — confirmed
- Budget ~$10–12/domain/year into COGS

### Subdomain for previews (cold outreach, non-paying)
- Non-activated listings live at: `preview.[platformdomain].com/[listingid]`
- Watermarked or gated with "Activate this site" overlay
- No custom domain purchased until payment confirmed

---

## 7. Lead Capture & Notifications

### Lead capture form fields
- First name (required)
- Last name (required)
- Email (required)
- Phone (required)
- Message (optional, pre-filled: "I'm interested in scheduling a showing")

### On form submission
1. Lead record saved to database (listing ID, timestamp, buyer contact info, source page)
2. **Instant text message** fired to agent — within 60 seconds
3. **Instant email** fired to agent
4. Auto-reply email sent to buyer confirming their inquiry was received
5. Lead data visible in agent portal (Phase 2)

### Lead alert text format
```
New buyer lead — 412 Magnolia Dr
Name: John Smith
Phone: (706) 555-0191
Email: john@email.com
Tap to call: [tel link]
Via: 412magnoliadrive.com
```

### Lead alert email format
- Subject: `New lead — 412 Magnolia Drive`
- Same info as text, plus timestamp and property photo thumbnail
- One-click call / email buttons

### Text message provider options
- **Twilio** (recommended) — reliable, good API, supports reply routing
- **Telnyx** — cheaper at scale

---

## 8. Seller Weekly Report

### Overview
Every Monday morning, an automated email is sent **directly to the seller** with that week's traffic and lead activity. The agent is CC'd. Neither the agent nor the seller needs to do anything to receive this.

### Seller email collection — confirmed approach
- Immediately after a site goes live, the agent receives their "site is live" text/email notification
- That notification includes a single line: **"Add your seller's email to activate their weekly report → [link]"**
- Link opens a one-field form: seller's email address. Submit. Done.
- If agent doesn't add seller email: weekly report sends to agent only (no seller copy)
- This is the **only per-listing action** ever asked of an agent

### Report content (weekly, auto-calculated)
| Metric | Source |
|---|---|
| Total website visits this week | Analytics (see Section 10) |
| Avg. time on page | Analytics |
| Buyer inquiries this week | Lead capture DB |
| % mobile viewers | Analytics |
| Top traffic source | Analytics |
| Traffic source breakdown | Analytics |
| Total views since launch | Analytics (cumulative) |
| Property site URL | DB |

### Report format
- Branded HTML email
- Clean, scannable layout — stats prominently displayed
- Short 2–3 sentence note auto-generated based on data (e.g., "Traffic is up 22% from last week. 3 new inquiries were received.")
- Agent's headshot and contact info in footer
- Sent every Monday at 8:00 AM local time (use listing ZIP to determine timezone)

### Final report (on close/withdraw)
- Triggered by MLS status change
- Includes: total views, total leads generated, days on market, date listed, date sold
- Subject: `Marketing summary — 412 Magnolia Drive [SOLD]`
- Sent to seller + agent

---

## 9. Cold Outreach Automation

### Trigger
New listing appears in MLS feed. Agent ID is **not** matched to an existing paying account.

### Email sequence
**Email 1 — Immediate (within 15 minutes of listing going live)**
- Subject: `Your site for [address] is ready`
- Body: Personalized with agent name, address, list price (from MLS data)
- Includes preview URL (subdomain, watermarked)
- Single CTA: "Activate for $49/month"

**Email 2 — Day 3 (if no activation)**
- Subject: `[address] — 47 people searched for homes like this today`
- Softer follow-up, social proof angle
- Same CTA

**Email 3 — Day 7 (if no activation)**
- Subject: `Last chance — your preview site for [address]`
- Urgency angle, keep it short
- Note: preview will be removed after 14 days if not activated

**Stop sequence if:** Agent activates, unsubscribes, or listing goes off-market

### Email sending
- Use **SendGrid** or **Postmark** for transactional + marketing email
- Must handle unsubscribes and CAN-SPAM compliance automatically
- Personalization tokens pulled from MLS data: `{{agent_first_name}}`, `{{address}}`, `{{list_price}}`

### Compliance notes
- Agent email addresses sourced from MLS — this is legitimate B2B outreach
- Include unsubscribe link in every email
- Honor opt-outs immediately
- Store suppression list in DB

---

## 10. Analytics & Dashboard

### Analytics tracking (per property site)
- Page views (daily, weekly, cumulative)
- Unique visitors
- Session duration / avg. time on page
- Traffic sources (direct, Google, Facebook, Instagram, QR code)
- Mobile vs. desktop split
- Geographic location of visitors (city level)
- Photo gallery engagement (which photos viewed most)

### Recommended analytics approach
- **Option A:** Embed Plausible Analytics or Fathom (privacy-first, GDPR-compliant, lightweight)
- **Option B:** Custom event tracking with a lightweight script + store in platform DB
- **Avoid:** Google Analytics (heavy, privacy concerns, GDPR friction)

### Agent dashboard (Phase 2 — not MVP)
- List of all active listings with traffic summary cards
- Click into individual listing for full analytics
- Lead history per listing
- Billing history
- Profile/settings editor

### What agents see vs. what sellers see
- **Agents:** Full analytics, lead details, all traffic sources
- **Sellers:** Simplified weekly email report only — no login, no portal

---

## 11. Billing & Subscription

### Payment processor
- **Stripe** (strongly recommended)
- Use Stripe Checkout for card collection during onboarding
- Stripe Billing for subscription management

### Billing model
- $49/month per active listing
- Subscription created per listing (not per agent account)
- Multiple active listings = multiple $49/month subscriptions running simultaneously
- Example: Agent with 3 active listings = $147/month total

### Billing triggers
| Event | Action |
|---|---|
| Agent activates a listing | Create Stripe subscription for that listing |
| MLS status → Sold/Withdrawn/Expired | Cancel Stripe subscription for that listing |
| Agent manually cancels | Cancel subscription, archive site immediately |
| Payment fails | Retry per Stripe dunning rules. Send alert to agent. Suspend (not delete) site after 7 days of failed payment |

### Invoicing
- Stripe auto-generates receipts
- Agent receives receipt email per subscription charge
- No manual invoicing required

---

## 12. Notifications Reference

### All notifications the platform sends

| Trigger | To | Method | Message |
|---|---|---|---|
| Site goes live (existing customer) | Agent | Text + Email | "Your site for [address] is live — [URL]" |
| New buyer lead submitted | Agent | Text + Email | Lead details + tap-to-call link |
| Weekly report sent | Seller (CC: Agent) | Email | Traffic + lead summary |
| Listing sold/withdrawn | Agent | Text | "Site for [address] archived. Billing stopped." |
| Final marketing report | Seller + Agent | Email | Full campaign summary |
| Payment failed | Agent | Email | Billing alert + update payment link |
| Cold outreach sequence | Prospective agent | Email | 3-email sequence (see Section 9) |
| Onboarding confirmation | New agent | Email | Welcome + what to expect |

---

## 13. Tech Stack Considerations

> Developer to confirm/modify — these are starting point recommendations

### Backend
- **Node.js** or **Python (FastAPI/Django)** — either works for this use case
- **PostgreSQL** — primary database (listings, agents, leads, analytics)
- **Redis** — job queues for async tasks (site builds, email sends, MLS polling)
- **Bull / Celery** — task queue for background jobs

### Frontend (property websites)
- **Next.js** (recommended) — SSR for SEO performance, fast page loads
- Each property site should be statically generated or ISR — critical for speed
- Mobile-first CSS — target 2s load time on 4G

### Infrastructure
- **Vercel or AWS** — for hosting property sites at scale
- Each site needs its own domain — wildcard SSL or per-domain SSL provisioning required
- **Cloudflare** — CDN, DDoS protection, domain management, SSL

### Third-party APIs
| Service | Purpose |
|---|---|
| MLS / RETS or RESO | Listing data feed |
| Stripe | Payments and subscriptions |
| Twilio | SMS lead alerts |
| SendGrid / Postmark | Email delivery |
| Google Places API | Nearby POI data |
| Walk Score API | Walk/Bike/Transit scores |
| GreatSchools API | School ratings |
| Namecheap or Cloudflare API | Domain registration |
| Google Maps or Mapbox | Property map embed |

### Key architectural decisions for developer
- How to handle custom domain provisioning at scale (1 domain per listing)
- Whether property sites are dynamically rendered or statically generated per listing
- How MLS data is ingested — polling schedule, change detection logic
- Cold email sending — separate sending domain/subdomain recommended to protect primary domain reputation

---

## 14. MVP Scope vs Phase 2

### MVP — must-have for launch
- [ ] MLS feed integration (polling-based is fine for MVP)
- [ ] Agent onboarding form (name, email, phone, MLS ID, headshot)
- [ ] Stripe payment integration
- [ ] Auto-build property website from MLS data (photos, details, map)
- [ ] Custom domain registration per listing
- [ ] Lead capture form + instant agent text/email alert
- [ ] Cold outreach email (Email 1 only for MVP — just the trigger email)
- [ ] Weekly seller report email (basic version — views + leads)
- [ ] MLS status monitoring — auto-archive on Sold/Withdrawn
- [ ] Site goes live notification to agent (text + email)

### Phase 2 — post-launch improvements
- [ ] Agent portal / dashboard (view all listings, analytics, billing)
- [ ] Full 3-email cold outreach sequence
- [ ] Neighborhood content auto-generation (schools, walk score, POIs)
- [ ] Auto-generated QR code + sign rider graphic emailed to agent
- [ ] Social share card (1080×1080) auto-generated
- [ ] Final sold report email
- [ ] Multi-market MLS expansion
- [ ] Brokerage team accounts (volume pricing)
- [ ] Photography partner referral tracking
- [ ] A/B testing for cold outreach subject lines

---

## 15. Open Questions for Developer

These need answers before build begins:

1. **MLS feed format** — ✅ Confirmed: **RESO Web API with webhooks.** MLS supports push/webhook delivery. Developer to implement webhook receiver endpoint and confirm event payload format with MLS board.

2. **Domain provisioning at scale** — ✅ Confirmed: **IONOS registrar API.** Developer to implement domain registration via IONOS API. SSL auto-provisioning via Let's Encrypt or Cloudflare — confirm approach with developer.

3. **Property site architecture** — ✅ Confirmed: **Static generation per listing.** Best for SEO and load speed. Developer to implement ISR (Incremental Static Regeneration) or rebuild trigger for mid-listing MLS data updates (price changes, new photos).

4. **Cold email sending reputation** — ✅ Confirmed: Outreach emails send from `mailer.[platformdomain].com`. Developer to configure SPF, DKIM, and DMARC records on this subdomain before any cold email goes out.

5. **Agent email sourcing** — ✅ Confirmed: Agent email addresses sourced directly from the **MLS feed**. Developer to map the correct RESO field (`ListAgentEmail`) and flag any records with missing or malformed email addresses for manual review.

6. **Seller email collection** — ✅ Confirmed: one-tap link sent in the site-live notification. One field (seller email). Submit. Done. If not completed, report sends to agent only. No seller portal, no login.

7. **Analytics storage** — ✅ Confirmed: **Custom event tracking stored in platform database (PostgreSQL).** No third-party analytics dependency. Developer to design events schema covering pageviews, sessions, traffic sources, lead submissions, and device type.

8. **Multi-listing billing** — ✅ Confirmed: **One Stripe subscription per listing.** Simple, transparent, and maps cleanly to the MLS lifecycle. Each subscription created on activation, cancelled automatically on close/withdraw.

9. **Preview site & domain registration** — ✅ Confirmed: Cold outreach preview shows the **full site with an activation banner overlay.** Custom domain is **not registered until payment is confirmed.** Preview lives on platform subdomain only. Domain registration triggers immediately post-payment.

10. **Site archiving** — When a listing closes, does the domain redirect anywhere? Redirect to agent's personal site (if we have that URL) or platform homepage?

---

## Appendix — Key Numbers

| Metric | Target |
|---|---|
| Time from MLS listing to site live | < 5 minutes |
| Time from MLS listing to cold outreach email sent | < 15 minutes |
| Time from lead form submission to agent text alert | < 60 seconds |
| Property site page load time (mobile, 4G) | < 2 seconds |
| Agent onboarding time | < 90 seconds |
| Seller report send time | Every Monday 8:00 AM local |

---

*Document prepared by platform owner. Questions and clarifications — contact before sprint planning.*
