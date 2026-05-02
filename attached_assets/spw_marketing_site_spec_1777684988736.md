# Single Property Website Platform — Marketing Site Spec
**Version:** 1.0  
**Prepared for:** Developer / Designer  
**Companion doc:** `spw_developer_plan.md`  
**Purpose:** Visual and copy spec for the public-facing marketing website (not the property sites — this is the SaaS homepage agents land on)

---

## Table of Contents

1. [Design Direction](#1-design-direction)
2. [Site Structure & Sections](#2-site-structure--sections)
3. [Copy & Messaging](#3-copy--messaging)
4. [Navigation](#4-navigation)
5. [Section Specs](#5-section-specs)
6. [Fonts & Colors](#6-fonts--colors)
7. [Developer Notes](#7-developer-notes)

---

## 1. Design Direction

### Aesthetic
Warm editorial luxury. The goal is to signal "serious, polished software" — not another startup landing page. Agents have been burned by cheap tools. The design should feel like something worth trusting.

- **Tone:** Confident, minimal, premium
- **NOT:** Purple gradients, stock-photo heroes, generic SaaS layouts
- **Reference feel:** High-end real estate brand meets B2B SaaS

### Typography
- **Display / headlines:** Playfair Display (serif) — weight 700, italic for emotional hooks
- **Body / UI:** DM Sans — weight 300 (body), 400 (UI), 500 (labels/CTAs)
- **Avoid:** Inter, Roboto, system fonts

### Color Palette
| Token | Hex | Usage |
|---|---|---|
| `--ink` | `#0e0e0e` | Primary text, dark backgrounds |
| `--cream` | `#f5f0e8` | Section backgrounds |
| `--warm-white` | `#faf8f4` | Default page background |
| `--gold` | `#c9a84c` | Accent, CTAs, italic highlights |
| `--gold-light` | `#e8c96b` | Hover states |
| `--muted` | `#6b6458` | Secondary text, labels |
| `--border` | `rgba(14,14,14,0.12)` | All borders and dividers |

### Layout Rules
- Max content width: `1200px`, centered
- Section padding: `5rem 3rem` (desktop)
- All borders: `1px solid var(--border)` — no box shadows
- Border radius: `4–6px` on cards and buttons
- Section numbering: large decorative numerals (`01`, `02`…) in `rgba(14,14,14,0.05)` behind section titles

---

## 2. Site Structure & Sections

```
Nav
│
├── Hero (split layout)
├── How It Works (4-step grid)
├── Pricing (2-column)
├── Comparison Table
├── Social Proof / Testimonials
├── CTA Banner
│
Footer
```

Total sections: 6 content sections + nav + footer. Single-page scroll, no subpages required for MVP.

---

## 3. Copy & Messaging

### Core value proposition
> "Your listing gets a site. Without you lifting a finger."

### Supporting message
> "We watch your MLS feed. The moment a new listing appears under your name, we build the full marketing site, register the domain, and start collecting leads — automatically."

### Key proof points (pull from Appendix in dev plan)
| Stat | Display format |
|---|---|
| MLS listing → live site | `< 5 min` |
| One-time setup | `90 sec` |
| Agent effort per listing | `$0` |

### Tone guidelines
- Write to a skeptical, busy agent who's seen marketing tools overpromise before
- Lead with outcomes, not features
- Short sentences. No buzzwords.
- Italicize emotional hooks in headlines (handled via Playfair italic)

---

## 4. Navigation

### Links (left to right)
```
[Logo]    How it works    Pricing    See an example    [Get started — $49/mo]
```

### Logo
- Wordmark only — no icon required at launch
- Format: `Prop` (regular weight) + `Site` (gold accent color)
- Font: Playfair Display

### CTA button (nav)
- Label: `Get started — $49/mo`
- Style: Filled, `--ink` background, `--warm-white` text
- Behavior: Scrolls to pricing section or opens onboarding flow

### Sticky behavior
- Nav sticks to top on scroll
- Background: `var(--warm-white)` with bottom border
- No shadow — border only

---

## 5. Section Specs

---

### Section 1 — Hero

**Layout:** Two-column, 50/50 split. Left = copy. Right = product preview.  
**Min height:** 88vh  
**Border:** Right column has left border; section has bottom border

#### Left column — copy
```
[Tag: FOR REAL ESTATE AGENTS]

Your listing gets a site.
Without you lifting
a finger.                        ← "a finger" in italic gold

[Subheadline]
We watch your MLS feed. The moment a new listing appears
under your name, we build the full marketing site, register
the domain, and start collecting leads — automatically.

[Primary CTA]  Start for $49 / listing
[Ghost link]   See a live example →

--- stat divider ---
< 5 min               90 sec               $0
MLS to live site      One-time setup       Per-listing effort
```

#### Tag pill
- Font: 0.7rem, 0.15em letter-spacing, uppercase
- Color: `--gold`
- Background: `rgba(201,168,76,0.1)`
- Border: `1px solid rgba(201,168,76,0.3)`
- Border radius: `2px`

#### Stat row
- Separated from copy block by a `1px` top border
- Numbers: Playfair Display, 1.75rem, weight 700
- Labels: DM Sans, 0.75rem, `--muted`

#### Right column — mock browser preview
Dark background (`--ink`). Centered mock browser showing a sample property site.

**Mock browser contents:**
- Browser chrome bar with traffic-light dots + fake URL (`412magnoliadrive.com`)
- Animated green "Live" badge (pulsing dot) in top right of browser bar
- Hero image area: dark green gradient (representing a listing photo)
- Price tag overlay: gold pill — `$485,000`
- Address overlay: `412 Magnolia Drive, Augusta GA`
- Property stats row: `4 bed · 3 bath · 2,340 sqft · 0.38 acre lot`
- Neighborhood scores chips: `Walk 68 · Bike 55 · Schools 8/10 · Transit 42`
- Lead capture form mockup: 4 input fields (2×2 grid) + gold CTA button ("Request showing")

---

### Section 2 — How It Works

**Section label:** `01`  
**Headline:** `Set up once. Every listing handles itself.`  
**Layout:** 4-column equal grid, full-width, bordered container

#### Step cards
Each step has:
- Small filled circle icon (dark background, white SVG icon)
- Large decorative step number (`1`, `2`, `3`, `4`) in faint ink, top-right
- Short headline (one line)
- 2–3 sentence description
- Time badge (gold pill)

| Step | Headline | Time badge |
|---|---|---|
| 1 | You onboard once | One time |
| 2 | We watch the MLS | Automatic |
| 3 | Site goes live in minutes | < 5 minutes |
| 4 | Leads + reports run themselves | Ongoing |

**Step 3 description note:** Explicitly mention custom domain, MLS photos, map, school data, walk scores — all auto-populated.

**Step 4 description note:** Mention 60-second SMS lead alert, Monday seller report, and auto-archive on close.

---

### Section 3 — Pricing

**Section label:** `02`  
**Headline:** `One price. Everything included.`  
**Background:** `var(--cream)` — differentiated from surrounding sections  
**Layout:** 2-column grid

#### Left card — the offer (featured/dark)
- Background: `--ink`
- Label: `PER ACTIVE LISTING` in gold
- Price: `$49` (Playfair, 3.5rem)
- Subtext: `per month · auto-cancels when sold or withdrawn`
- Feature list (6 items with gold checkmark circles):
  1. Custom street-address domain (412magnoliadrive.com)
  2. Full property website — MLS photos, map, school data, walk scores
  3. Instant SMS + email lead alerts (< 60 seconds)
  4. Automated seller weekly report — every Monday
  5. QR code + print-ready sign rider PDF
  6. Auto-archives + billing stops when listing closes
- CTA: Gold filled button — `Get started`

#### Right card — objection handling
Title: `WHAT YOU DON'T PAY FOR`

Four items, each with an `×` circle icon:
1. **No setup fees** — Activate today, first charge when billing period starts
2. **No domain add-ons** — Domain registration included. We handle it, you don't think about it.
3. **No contracts** — Cancel any time. Or don't — billing stops automatically at close.
4. **No per-feature tiers** — Everything is included at $49. There is no "Pro" plan.

**Math callout box** (gold-tinted, inside right card):
> "3 active listings at once? That's $147/month total — and three sites, three domains, and three seller reports running with zero additional work from you."

---

### Section 4 — Comparison Table

**Section label:** `03`  
**Headline:** `How we compare`  
**Layout:** Full-width table

#### Columns
`Feature` | `PropSite` | `Rela` | `CribFlyer` | `PhotoUp`

PropSite column header styled in gold with 2px gold bottom border.

#### Rows
| Feature | PropSite | Rela | CribFlyer | PhotoUp |
|---|---|---|---|---|
| Agent effort per listing | Zero | Upload + write copy | Upload photos | Upload photos |
| MLS-triggered automation | ✓ | — | — | — |
| Custom domain per listing | ✓ Included | Add-on fee | — | — |
| Seller weekly traffic report | ✓ Auto-sent | Manual | — | — |
| Instant SMS lead alerts | ✓ | ✓ | — | — |
| Auto-archives at close | ✓ | — | — | — |
| Pricing | $49 flat, everything in | Tiered + domain add-on | Per-listing variable | Per-feature |

#### Styling
- ✓ marks: green (`#28a865`)
- — marks: light gray
- PropSite cells: full ink weight, not muted
- Row hover: subtle `rgba(14,14,14,0.02)` background

---

### Section 5 — Social Proof

**Section label:** `04`  
**Headline:** `Agents love never thinking about this again.`  
**Background:** `--ink` (dark section)  
**Layout:** 3-column card grid

#### Testimonial card structure
- Quote (italic, muted white, 0.9rem)
- Avatar initials circle (gold-tinted background)
- Agent name
- Brokerage + market

#### Sample testimonials (replace with real at launch)
1. **Sarah R., Keller Williams · Augusta, GA**
   > "I got a text saying my new listing's site was live. I hadn't even finished writing the MLS description yet. That's when I realized this thing actually works."

2. **David M., RE/MAX · Columbia, SC**
   > "My sellers ask me every single listing 'how are people finding out about the house?' Now I just forward them the Monday report. They're always impressed."

3. **Tracy L., Meybohm Real Estate · CSRA**
   > "I was skeptical, but the site it built for my Walton Way listing was better than anything I would have made myself. And it had a showing request within 48 hours."

---

### Section 6 — CTA Banner

**Layout:** Full-width, centered, generous padding (6rem)  
**Headline:** `Your next listing deserves a proper website.` (italic on "proper website")  
**Subtext:** `Set up once in 90 seconds. Every listing after that is automatic.`  
**CTA:** `Get started — $49 / listing` (large, filled button)  
**Ghost link:** `See a live example →`  
**Fine print:** `No setup fees · No contracts · Billing stops automatically when your listing closes`

---

### Footer

**Layout:** 3-column, single row — Logo | Copyright | Nav links  
**Links:** Privacy · Terms · Support  
**Background:** `--warm-white` with top border

---

## 6. Fonts & Colors

### Google Fonts
```html
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;700&family=DM+Sans:wght@300;400;500&display=swap" rel="stylesheet">
```

### CSS Variables
```css
:root {
  --ink: #0e0e0e;
  --cream: #f5f0e8;
  --warm-white: #faf8f4;
  --gold: #c9a84c;
  --gold-light: #e8c96b;
  --muted: #6b6458;
  --border: rgba(14,14,14,0.12);
}
```

---

## 7. Developer Notes

### Stack recommendation
- **Framework:** Next.js (consistent with property site stack in main dev plan)
- **Hosting:** Vercel
- **Forms:** Stripe Checkout link for the CTA — no custom form needed at launch. Onboarding form is a separate page/flow per `spw_developer_plan.md` Section 4.

### "See a live example" link
Point to a real published property site once one exists. Pre-launch: point to the mock browser preview or a static demo page at `demo.[platformdomain].com`.

### Testimonials
Placeholder copy used above. Replace with real agent quotes before launch. Collect during beta.

### Platform name
`PropSite` used as placeholder throughout. Replace globally once name is confirmed.

### Analytics on the marketing site
- Lightweight page analytics — Plausible or Fathom recommended (consistent with property site analytics approach)
- Track: CTA clicks, scroll depth, "See an example" clicks
- No Google Analytics

### Mobile
- Hero section collapses to single column on mobile (copy above, browser preview below)
- Step grid wraps to 2×2 then 1-column
- Pricing cards stack vertically
- Nav collapses to hamburger menu
- All CTAs must be tap-friendly (min 44px touch target)

### Page performance
- Fonts loaded via Google Fonts with `display=swap`
- No heavy JS dependencies — marketing site should load in < 1.5s
- Compress any images used (hero background, agent headshots in testimonials)

---

*Companion to `spw_developer_plan.md`. Questions — contact platform owner before build begins.*
