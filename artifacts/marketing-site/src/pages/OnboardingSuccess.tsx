import { useEffect, useState } from "react";
import { Link } from "wouter";
import { setPageSeo } from "@/lib/seo";

const API_BASE = import.meta.env.VITE_API_URL ?? "";

interface AgentProfile {
  firstName: string;
  lastName: string;
  email: string;
  brokerage?: string | null;
  mlsAgentId: string;
}

function getTokenFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("token");
}

export default function OnboardingSuccess() {
  const [agent, setAgent] = useState<AgentProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const token = getTokenFromUrl();

  useEffect(() => {
    // noindex — URL carries a magic token.
    setPageSeo({
      title: "You're in — PropSite",
      description: "Your PropSite account is live. Finish your profile to add your headshot and brokerage logo.",
      path: "/onboarding/success",
      index: false,
    });
  }, []);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    fetch(`${API_BASE}/api/agents/profile?token=${encodeURIComponent(token)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (body?.agent) setAgent(body.agent as AgentProfile);
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [token]);

  return (
    <div className="min-h-[100dvh] bg-warm-white text-ink font-sans flex flex-col">
      <header className="px-6 md:px-10 py-6 flex items-center justify-between border-b border-ink/10">
        <Link href="/">
          <img src="/propsite-logo.png" alt="PropSite" className="h-6 w-auto" />
        </Link>
      </header>

      <main className="flex-1 flex items-start md:items-center justify-center px-6 py-10 md:py-16">
        <div className="w-full max-w-2xl text-center" data-testid="onboarding-success">
          <p className="text-[10px] uppercase tracking-[0.4em] text-gold mb-4">All set</p>
          <h1 className="font-serif text-4xl md:text-6xl leading-[1.05] mb-6">
            {loading
              ? "Welcome aboard."
              : agent
                ? `You're in, ${agent.firstName}.`
                : "You're in."}
          </h1>
          <p className="text-muted text-base md:text-lg mb-10 max-w-xl mx-auto">
            Your card is on file. From now on, the moment a new listing hits the MLS under your
            agent ID, we'll build it a custom property website and email you the preview. You
            don't need to log in again.
          </p>

          <div className="border-y border-ink/10 py-8 mb-10 grid grid-cols-1 sm:grid-cols-3 gap-6 text-left">
            <Step
              num="1"
              title="Watch your inbox"
              body="A welcome email is on its way. Reply to it any time you have a question."
            />
            <Step
              num="2"
              title="List a property"
              body="The next listing under your MLS ID auto-builds a site within minutes."
            />
            <Step
              num="3"
              title="Activate it"
              body="Click Activate in the preview email — we register the domain and go live."
            />
          </div>

          {token && (
            <Link
              href={`/profile?token=${encodeURIComponent(token)}`}
              className="inline-block h-12 px-8 bg-ink text-warm-white text-xs uppercase tracking-[0.3em] hover:bg-ink/90 transition-colors leading-[3rem]"
              data-testid="link-edit-profile"
            >
              Finish your profile (headshot + logo)
            </Link>
          )}

          {!token && (
            <Link
              href="/"
              className="inline-block h-12 px-8 bg-ink text-warm-white text-xs uppercase tracking-[0.3em] hover:bg-ink/90 transition-colors leading-[3rem]"
            >
              Back home
            </Link>
          )}
        </div>
      </main>
    </div>
  );
}

function Step({ num, title, body }: { num: string; title: string; body: string }) {
  return (
    <div>
      <p className="font-serif text-3xl text-gold mb-2">{num}</p>
      <h3 className="font-serif text-xl text-ink mb-2">{title}</h3>
      <p className="text-sm text-muted leading-relaxed">{body}</p>
    </div>
  );
}
