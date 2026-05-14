export const PLATFORM_NAME = "PropSite";
export const WORDMARK_PREFIX = "Prop";
export const WORDMARK_SUFFIX = "Site";

export const PAGE_TITLE = `${PLATFORM_NAME} — Automated Property Websites for Real Estate Agents`;
export const PAGE_DESCRIPTION =
  "We watch your MLS feed. The moment a new listing appears under your name, we build the full marketing site, register the domain, and start collecting leads — automatically.";

export const HERO = {
  eyebrow: "FOR REAL ESTATE AGENTS",
  headline: ["Your listing gets a site.", "Without you lifting", "a finger."],
  subhead: PAGE_DESCRIPTION,
  primaryCta: "Set up automation — $49 / listing",
  secondaryCta: "See a live example",
  stats: [
    { value: "< 5 min", label: "MLS to live site" },
    { value: "90 sec", label: "One-time setup" },
    { value: "$0", label: "Per-listing effort" },
  ],
};

export const HOW_IT_WORKS = {
  headline: "Set up once. Every listing handles itself.",
  steps: [
    {
      num: "1",
      badge: "One time",
      title: "You onboard once",
      body: "Connect your MLS profile in 90 seconds. We securely link to your agent ID and watch for new activity.",
    },
    {
      num: "2",
      badge: "Automatic",
      title: "We watch the MLS",
      body: "The second a new listing hits the MLS under your name, our system detects it and springs into action.",
    },
    {
      num: "3",
      badge: "< 5 minutes",
      title: "Site goes live in minutes",
      body: "We automatically register a custom street-address domain and auto-populate your site with MLS photos, map, school data, and walk scores.",
    },
    {
      num: "4",
      badge: "Ongoing",
      title: "Leads + reports run themselves",
      body: "Get a 60-second email lead alert when someone requests a showing. We send your sellers a Monday traffic report automatically, and archive the site when the listing closes.",
    },
  ],
};

export const PRICING = {
  headline: "One price. Everything included.",
  price: "$49",
  priceSuffix: "per month · auto-cancels when sold or withdrawn",
  eyebrow: "PER ACTIVE LISTING",
  cta: "Get started",
  features: [
    "MLS-triggered: site is live before you've finished writing the description",
    "Free street-address domain (e.g. 2918arrowheaddrive.com) — no $15/yr add-on like Rela",
    "Custom mortgage calculator pre-loaded with current CSRA rates",
    "60-second lead alerts straight to your phone — call/text/email captured",
    "Auto-sent Monday seller report — show your sellers you're working without lifting a finger",
    "QR code + print-ready sign rider PDF, generated automatically",
    "Auto-archives + billing stops the day your listing closes — no cancellation needed",
    "$49 flat — no Pro tier, no per-feature upsells, no setup fees ever",
  ],
  noCharges: [
    { title: "No setup fees", desc: "Activate today, first charge when billing period starts" },
    { title: "No domain add-ons", desc: "Domain registration included. We handle it, you don't think about it." },
    { title: "No contracts", desc: "Cancel any time. Or don't — billing stops automatically at close." },
    { title: "No per-feature tiers", desc: 'Everything is included at $49. There is no "Pro" plan.' },
  ],
  pullQuote:
    '"3 active listings at once? That\'s $147/month total — and three sites, three domains, and three seller reports running with zero additional work from you."',
};

export const COMPARISON = {
  headline: "How we compare",
  competitors: ["Rela", "CribFlyer", "PhotoUp"],
  rows: [
    { feature: "Agent effort per listing", propsite: "Zero", rela: "Upload + write copy", cribflyer: "Upload photos", photoup: "Upload photos" },
    { feature: "MLS-triggered automation", propsite: "✓", rela: "—", cribflyer: "—", photoup: "—" },
    { feature: "Custom domain per listing", propsite: "✓ Included", rela: "Add-on fee", cribflyer: "—", photoup: "—" },
    { feature: "Seller weekly traffic report", propsite: "✓ Auto-sent", rela: "Manual", cribflyer: "—", photoup: "—" },
    { feature: "Instant email lead alerts", propsite: "✓", rela: "✓", cribflyer: "—", photoup: "—" },
    { feature: "Auto-archives at close", propsite: "✓", rela: "—", cribflyer: "—", photoup: "—" },
    { feature: "Pricing", propsite: "$49 flat, everything in", rela: "Tiered + domain add-on", cribflyer: "Per-listing variable", photoup: "Per-feature" },
  ],
};

export const SOCIAL_PROOF = {
  headline: "Agents love never thinking about this again.",
  testimonials: [
    {
      quote:
        "I got back from a showing and my seller had already texted me asking for the website link. PropSite had it live before I even got home. That's when I stopped questioning it.",
      initials: "PH",
      name: "Purvis Huggins",
      brokerage: "Purvis Huggins Realty · Augusta, GA",
    },
    {
      quote:
        "My sellers used to ask me every week what kind of marketing I was doing. Now I just forward them the Monday report. They love it and I didn't do a thing.",
      initials: "FG",
      name: "Forrest G",
      brokerage: "Forrest G Realty · CSRA",
    },
    {
      quote:
        "I was skeptical, but the site it built for my Walton Way listing was better than anything I would have made myself. And it had a showing request within 48 hours.",
      initials: "TL",
      name: "Tracy L.",
      brokerage: "Meybohm Real Estate · CSRA",
    },
  ],
};

export const FAQ = {
  eyebrow: "COMMON QUESTIONS",
  headline: "Everything you'd want to know before signing up.",
  items: [
    {
      q: "How does PropSite get access to my MLS listings?",
      a: "You connect your MLS agent ID during the 90-second onboarding. PropSite monitors the CSRA MLS feed for new listings under your name — we never touch your MLS login credentials or act on your behalf outside of reading listing data.",
    },
    {
      q: "Is this IDX-compliant?",
      a: "Yes. Every listing site includes the required IDX attribution, brokerage disclosure, and MLS disclaimer. We follow CSRA MLS IDX display rules so you don't have to think about it.",
    },
    {
      q: "Who owns the leads captured on my listing site?",
      a: "You do, entirely. Lead contact details — name, phone, email, and showing request notes — are delivered straight to you via email alert. PropSite does not sell, share, or remarket to your leads.",
    },
    {
      q: "Who owns the domain? What happens to it when the listing closes?",
      a: "The domain is registered in your listing's name (e.g. 2918arrowheaddrive.com) and operated by PropSite for the life of the listing. When the listing closes or is withdrawn, the site archives automatically and the domain is retired — no action needed from you.",
    },
    {
      q: "Can I edit the site if the MLS data is wrong?",
      a: "The fastest fix is always to correct the data in the MLS — PropSite syncs changes within minutes. If you need an immediate adjustment outside the MLS, contact support and we'll update it manually.",
    },
    {
      q: "What if I have multiple active listings at once?",
      a: "Each active listing is $49/month with its own site, domain, and seller report. Billing is per listing and stops automatically when each one closes — so three listings is $147/month total, and it drops as they sell.",
    },
  ],
};

export const CTA_BANNER = {
  headline: ["Your next listing deserves a", "proper website."],
  subhead: "Set up once in 90 seconds. Every listing after that is automatic.",
  primaryCta: "Set up automation — $49 / listing",
  secondaryCta: "See a live example",
  footnote: "No setup fees · No contracts · Billing stops automatically when your listing closes",
};

export const NAV = {
  links: [
    { label: "How it works", targetId: "how-it-works" },
    { label: "Pricing", targetId: "pricing" },
  ],
  exampleLink: "See an example",
  cta: "Get started — $49/mo",
};
