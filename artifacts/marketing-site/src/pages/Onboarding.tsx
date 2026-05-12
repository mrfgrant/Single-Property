import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { WORDMARK_PREFIX, WORDMARK_SUFFIX } from "@/lib/copy";
import { REGION } from "@/lib/config";
import { setPageSeo } from "@/lib/seo";

const API_BASE = import.meta.env.VITE_API_URL ?? "";

interface FormState {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  brokerage: string;
  mlsAgentId: string;
  personalWebsiteUrl: string;
}

const EMPTY: FormState = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  brokerage: "",
  mlsAgentId: "",
  personalWebsiteUrl: "",
};

type Mode = "form" | "submitting" | "out-of-market" | "waitlist-done" | "error" | "no-payment";

export default function Onboarding() {
  const [, setLocation] = useLocation();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [mode, setMode] = useState<Mode>("form");
  const [error, setError] = useState<string>("");

  useEffect(() => {
    setPageSeo({
      title: "Get started in 90 seconds — PropSite",
      description:
        "Onboard your MLS Agent ID and add a card on file. From then on, every new listing under your name auto-builds a property site at $49/mo — billed only while live.",
      path: "/onboarding",
    });
  }, []);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setMode("submitting");
    setError("");

    try {
      const res = await fetch(`${API_BASE}/api/onboarding`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          email: form.email.trim().toLowerCase(),
          phone: form.phone.trim() || undefined,
          brokerage: form.brokerage.trim() || undefined,
          mlsAgentId: form.mlsAgentId.trim(),
          personalWebsiteUrl: form.personalWebsiteUrl.trim() || undefined,
        }),
      });

      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        setMode("error");
        setError(typeof body?.error === "string" ? body.error : "Something went wrong. Please try again.");
        return;
      }

      if (body.outOfMarket) {
        setMode("out-of-market");
        return;
      }

      if (body.checkoutUrl) {
        // Hand off to Stripe to collect a card on file.
        window.location.href = body.checkoutUrl;
        return;
      }

      // Account created but no Stripe checkout URL (Stripe not configured).
      // Send the agent straight to their profile via the magic link.
      setMode("no-payment");
      if (body.profileUrl) {
        setLocation("/onboarding/success");
      }
    } catch (err) {
      setMode("error");
      setError(err instanceof Error ? err.message : "Network error. Please try again.");
    }
  }

  async function handleJoinWaitlist(e: FormEvent) {
    e.preventDefault();
    setMode("submitting");
    setError("");
    try {
      const res = await fetch(`${API_BASE}/api/waitlist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim() || undefined,
          email: form.email.trim().toLowerCase(),
          mlsBoardName: form.brokerage.trim() || undefined,
          source: "onboarding_redirect",
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setMode("out-of-market");
        setError(typeof body?.error === "string" ? body.error : "Could not join waitlist.");
        return;
      }
      setMode("waitlist-done");
    } catch (err) {
      setMode("out-of-market");
      setError(err instanceof Error ? err.message : "Network error.");
    }
  }

  return (
    <div className="min-h-[100dvh] bg-warm-white text-ink font-sans flex flex-col">
      {/* Top bar */}
      <header className="px-6 md:px-10 py-6 flex items-center justify-between border-b border-ink/10">
        <Link href="/">
          <img src="/propsite-logo.png" alt="PropSite" className="h-5 w-auto max-w-[100px]" />
        </Link>
        <p className="text-[10px] uppercase tracking-[0.3em] text-muted">
          90 seconds · {REGION.marketName}
        </p>
      </header>

      <main className="flex-1 flex items-start md:items-center justify-center px-6 py-10 md:py-16">
        <div className="w-full max-w-2xl">
          {(mode === "form" || mode === "submitting" || mode === "error" || mode === "no-payment") && (
            <>
              <p className="text-[10px] uppercase tracking-[0.4em] text-gold mb-4">Get Started</p>
              <h1 className="font-serif text-4xl md:text-5xl leading-[1.05] mb-4">
                One quick setup.
                <br />
                Every listing handles itself.
              </h1>
              <p className="text-muted text-base md:text-lg mb-10 max-w-xl">
                Tell us who you are and link your MLS Agent ID. Once a card is on file, every
                future listing under your name gets its own website automatically — billed only
                while live, $49 per active listing.
              </p>

              <form onSubmit={handleSubmit} className="space-y-6" data-testid="onboarding-form">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <Field label="First name" required>
                    <input
                      required
                      autoComplete="given-name"
                      value={form.firstName}
                      onChange={(e) => update("firstName", e.target.value)}
                      data-testid="input-firstName"
                      className={inputCls}
                    />
                  </Field>
                  <Field label="Last name" required>
                    <input
                      required
                      autoComplete="family-name"
                      value={form.lastName}
                      onChange={(e) => update("lastName", e.target.value)}
                      data-testid="input-lastName"
                      className={inputCls}
                    />
                  </Field>
                </div>

                <Field label="Work email" required>
                  <input
                    required
                    type="email"
                    autoComplete="email"
                    value={form.email}
                    onChange={(e) => update("email", e.target.value)}
                    data-testid="input-email"
                    className={inputCls}
                  />
                </Field>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <Field label="Phone" required>
                    <input
                      required
                      type="tel"
                      autoComplete="tel"
                      value={form.phone}
                      onChange={(e) => update("phone", e.target.value)}
                      data-testid="input-phone"
                      className={inputCls}
                    />
                  </Field>
                  <Field label="Brokerage" required>
                    <input
                      required
                      autoComplete="organization"
                      value={form.brokerage}
                      onChange={(e) => update("brokerage", e.target.value)}
                      data-testid="input-brokerage"
                      className={inputCls}
                    />
                  </Field>
                </div>

                <Field
                  label="MLS Agent ID"
                  required
                  hint={`We use this to detect your new listings on the ${REGION.mlsBoardName}.`}
                >
                  <input
                    required
                    autoComplete="off"
                    value={form.mlsAgentId}
                    onChange={(e) => update("mlsAgentId", e.target.value)}
                    placeholder="e.g. AUG12345"
                    data-testid="input-mlsAgentId"
                    className={inputCls}
                  />
                </Field>

                <Field
                  label="Personal website (optional)"
                  hint="When a listing closes, its custom domain will redirect here."
                >
                  <input
                    type="url"
                    inputMode="url"
                    placeholder="https://yourname.com"
                    value={form.personalWebsiteUrl}
                    onChange={(e) => update("personalWebsiteUrl", e.target.value)}
                    data-testid="input-personalWebsiteUrl"
                    className={inputCls}
                  />
                </Field>

                {error && (
                  <p
                    data-testid="form-error"
                    className="text-sm text-red-700 bg-red-50 border border-red-200 px-4 py-3 rounded"
                  >
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={mode === "submitting"}
                  data-testid="submit-onboarding"
                  className="w-full h-14 bg-ink text-warm-white text-xs uppercase tracking-[0.3em] hover:bg-ink/90 transition-colors disabled:opacity-60"
                >
                  {mode === "submitting" ? "Creating your account…" : "Continue to add a card"}
                </button>

                <p className="text-[11px] text-muted text-center">
                  No charge today — billing only starts when you activate your first listing.
                </p>
              </form>

              {mode === "no-payment" && (
                <div className="mt-6 p-4 border border-gold/40 bg-gold/5 rounded text-sm text-ink">
                  Your account is set up. Payments aren't yet configured for this environment, so
                  we couldn't redirect you to add a card — finish that step from your profile.
                </div>
              )}
            </>
          )}

          {mode === "out-of-market" && (
            <div data-testid="out-of-market-state">
              <p className="text-[10px] uppercase tracking-[0.4em] text-gold mb-4">
                Coming soon to your area
              </p>
              <h1 className="font-serif text-4xl md:text-5xl leading-[1.05] mb-4">
                We're not in your MLS yet.
              </h1>
              <p className="text-muted text-base md:text-lg mb-8 max-w-xl">
                {WORDMARK_PREFIX}
                {WORDMARK_SUFFIX} currently serves the {REGION.marketName} market only. Drop your
                email and we'll let you know the day we light up your board — no spam, one email
                when we launch.
              </p>

              <form onSubmit={handleJoinWaitlist} className="space-y-5 max-w-md">
                <Field label="MLS / Board name" hint="So we know which board to prioritize.">
                  <input
                    value={form.brokerage}
                    onChange={(e) => update("brokerage", e.target.value)}
                    placeholder="e.g. Central Texas MLS"
                    data-testid="input-mlsBoardName"
                    className={inputCls}
                  />
                </Field>

                {error && (
                  <p className="text-sm text-red-700 bg-red-50 border border-red-200 px-4 py-3 rounded">
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  data-testid="join-waitlist"
                  className="w-full h-14 bg-ink text-warm-white text-xs uppercase tracking-[0.3em] hover:bg-ink/90 transition-colors"
                >
                  Join the waitlist
                </button>
              </form>
            </div>
          )}

          {mode === "waitlist-done" && (
            <div className="text-center py-12" data-testid="waitlist-done-state">
              <p className="text-[10px] uppercase tracking-[0.4em] text-gold mb-4">You're on the list</p>
              <h1 className="font-serif text-4xl md:text-5xl leading-[1.05] mb-4">
                We'll be in touch.
              </h1>
              <p className="text-muted text-base md:text-lg mb-10 max-w-xl mx-auto">
                Thanks {form.firstName || "there"} — we've saved your spot. The day we add your
                board to {WORDMARK_PREFIX}
                {WORDMARK_SUFFIX}, you'll be the first to know.
              </p>
              <Link
                href="/"
                className="inline-block h-12 px-8 bg-ink text-warm-white text-xs uppercase tracking-[0.3em] hover:bg-ink/90 transition-colors leading-[3rem]"
              >
                Back home
              </Link>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

const inputCls =
  "w-full h-11 px-0 bg-transparent text-ink border-b border-ink/30 focus:outline-none focus:border-ink placeholder:text-muted/70 text-sm";

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div>
      <label className="flex items-baseline justify-between text-[10px] tracking-[0.3em] uppercase text-muted mb-2">
        <span>
          {label} {required && <span className="text-gold">*</span>}
        </span>
      </label>
      {children}
      {hint && <p className="text-[11px] text-muted/80 mt-1.5">{hint}</p>}
    </div>
  );
}
