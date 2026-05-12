import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { setPageSeo } from "@/lib/seo";

const API_BASE = import.meta.env.VITE_API_URL ?? "";

interface AgentProfile {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
  brokerage?: string | null;
  mlsAgentId: string;
  personalWebsiteUrl?: string | null;
  headshotUrl?: string | null;
  logoUrl?: string | null;
}

// Patch payload allows explicit null to clear an asset on the server.
type AgentProfilePatch = Partial<
  Omit<AgentProfile, "id" | "email" | "mlsAgentId" | "headshotUrl" | "logoUrl">
> & {
  headshotUrl?: string | null;
  logoUrl?: string | null;
};

function getTokenFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("token");
}

async function uploadAsset(file: File): Promise<string> {
  const presignRes = await fetch(`${API_BASE}/api/storage/uploads/request-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: file.name,
      size: file.size,
      contentType: file.type || "application/octet-stream",
    }),
  });
  if (!presignRes.ok) throw new Error("Could not get upload URL");
  const { uploadURL, objectPath } = (await presignRes.json()) as {
    uploadURL: string;
    objectPath: string;
  };

  const putRes = await fetch(uploadURL, {
    method: "PUT",
    headers: { "Content-Type": file.type || "application/octet-stream" },
    body: file,
  });
  if (!putRes.ok) throw new Error("Upload failed");

  // Resolve to a public URL we can persist on the agent record.
  const apiOrigin = API_BASE || window.location.origin;
  // objectPath looks like "/objects/<uuid>" — serve it via the api.
  return `${apiOrigin}/api/storage${objectPath}`;
}

export default function Profile() {
  const [agent, setAgent] = useState<AgentProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingHeadshot, setUploadingHeadshot] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const headshotInput = useRef<HTMLInputElement>(null);
  const logoInput = useRef<HTMLInputElement>(null);
  const token = getTokenFromUrl();

  useEffect(() => {
    setPageSeo({
      title: "Your profile — PropSite",
      description: "Edit your PropSite profile, upload your headshot and brokerage logo, and manage billing.",
      path: "/profile",
      index: false,
    });
  }, []);

  useEffect(() => {
    if (!token) {
      setError("Missing access token. Open the link from your welcome email.");
      setLoading(false);
      return;
    }
    fetch(`${API_BASE}/api/agents/profile?token=${encodeURIComponent(token)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error("Could not load your profile");
        const body = (await r.json()) as { agent: AgentProfile };
        setAgent(body.agent);
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : "Could not load your profile");
      })
      .finally(() => setLoading(false));
  }, [token]);

  async function patch(partial: AgentProfilePatch) {
    if (!token) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/agents/profile?token=${encodeURIComponent(token)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(partial),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Failed to save");
      }
      const body = (await res.json()) as { agent: AgentProfile };
      setAgent(body.agent);
      setSavedAt(Date.now());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleAssetChange(
    e: React.ChangeEvent<HTMLInputElement>,
    kind: "headshot" | "logo",
  ) {
    const file = e.target.files?.[0];
    if (!file) return;
    const setBusy = kind === "headshot" ? setUploadingHeadshot : setUploadingLogo;
    setBusy(true);
    setError(null);
    try {
      const url = await uploadAsset(file);
      await patch(kind === "headshot" ? { headshotUrl: url } : { logoUrl: url });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  }

  async function handleFormSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!agent) return;
    const fd = new FormData(e.currentTarget);
    await patch({
      firstName: String(fd.get("firstName") ?? ""),
      lastName: String(fd.get("lastName") ?? ""),
      phone: String(fd.get("phone") ?? ""),
      brokerage: String(fd.get("brokerage") ?? ""),
      personalWebsiteUrl: String(fd.get("personalWebsiteUrl") ?? ""),
    });
  }

  async function openBillingPortal() {
    if (!token) return;
    setError(null);
    try {
      const res = await fetch(
        `${API_BASE}/api/agents/billing-portal?token=${encodeURIComponent(token)}`,
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Could not open billing portal");
      }
      const body = (await res.json()) as { url: string };
      window.location.href = body.url;
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not open billing portal");
    }
  }

  return (
    <div className="min-h-[100dvh] bg-warm-white text-ink font-sans flex flex-col">
      <header className="px-6 md:px-10 py-6 flex items-center justify-between border-b border-ink/10">
        <Link href="/">
          <img src="/propsite-logo.png" alt="PropSite" className="h-5 w-auto max-w-[100px]" />
        </Link>
      </header>

      <main className="flex-1 px-6 py-10 md:py-16">
        <div className="max-w-2xl mx-auto" data-testid="profile-page">
          <p className="text-[10px] uppercase tracking-[0.4em] text-gold mb-3">Your profile</p>
          <h1 className="font-serif text-4xl md:text-5xl mb-2">Profile &amp; branding</h1>
          <p className="text-muted mb-10">
            These details appear on every PropSite property page we build for you.
          </p>

          {loading && <p className="text-muted">Loading your profile…</p>}
          {error && (
            <div
              className="mb-6 border border-red-300 bg-red-50 text-red-800 px-4 py-3 text-sm"
              data-testid="profile-error"
            >
              {error}
            </div>
          )}
          {savedAt && !error && (
            <div
              className="mb-6 border border-green-300 bg-green-50 text-green-900 px-4 py-3 text-sm"
              data-testid="profile-saved"
            >
              Saved.
            </div>
          )}

          {agent && (
            <>
              {/* Brand assets */}
              <section className="mb-10 pb-10 border-b border-ink/10">
                <h2 className="font-serif text-2xl mb-6">Brand assets</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                  <AssetSlot
                    label="Headshot"
                    url={agent.headshotUrl}
                    busy={uploadingHeadshot}
                    onPick={() => headshotInput.current?.click()}
                    onRemove={() => patch({ headshotUrl: null })}
                    inputRef={headshotInput}
                    onChange={(e) => handleAssetChange(e, "headshot")}
                    testId="headshot"
                  />
                  <AssetSlot
                    label="Brokerage logo"
                    url={agent.logoUrl}
                    busy={uploadingLogo}
                    onPick={() => logoInput.current?.click()}
                    onRemove={() => patch({ logoUrl: null })}
                    inputRef={logoInput}
                    onChange={(e) => handleAssetChange(e, "logo")}
                    testId="logo"
                  />
                </div>
              </section>

              {/* Contact info */}
              <form onSubmit={handleFormSave} className="mb-10 pb-10 border-b border-ink/10 space-y-5">
                <h2 className="font-serif text-2xl mb-2">Contact &amp; brokerage</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <Field
                    label="First name"
                    name="firstName"
                    defaultValue={agent.firstName}
                    required
                  />
                  <Field
                    label="Last name"
                    name="lastName"
                    defaultValue={agent.lastName}
                    required
                  />
                  <Field
                    label="Phone"
                    name="phone"
                    type="tel"
                    defaultValue={agent.phone ?? ""}
                  />
                  <Field
                    label="Brokerage"
                    name="brokerage"
                    defaultValue={agent.brokerage ?? ""}
                  />
                  <Field
                    label="Personal website"
                    name="personalWebsiteUrl"
                    type="url"
                    defaultValue={agent.personalWebsiteUrl ?? ""}
                    placeholder="https://"
                    full
                  />
                </div>
                <p className="text-xs text-muted">
                  Email: <span className="text-ink">{agent.email}</span> · MLS Agent ID:{" "}
                  <span className="text-ink">{agent.mlsAgentId}</span> · To change these,
                  reply to your welcome email.
                </p>
                <button
                  type="submit"
                  disabled={saving}
                  className="h-12 px-8 bg-ink text-warm-white text-xs uppercase tracking-[0.3em] hover:bg-ink/90 transition-colors disabled:opacity-50"
                  data-testid="button-save-profile"
                >
                  {saving ? "Saving…" : "Save changes"}
                </button>
              </form>

              {/* Billing */}
              <section>
                <h2 className="font-serif text-2xl mb-3">Billing</h2>
                <p className="text-muted text-sm mb-5">
                  Update your payment method, download invoices, or cancel any active site
                  subscription in the Stripe customer portal.
                </p>
                <button
                  type="button"
                  onClick={openBillingPortal}
                  className="h-12 px-8 border border-ink text-ink text-xs uppercase tracking-[0.3em] hover:bg-ink hover:text-warm-white transition-colors"
                  data-testid="button-billing-portal"
                >
                  Open billing portal
                </button>
              </section>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

function Field(props: {
  label: string;
  name: string;
  defaultValue?: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
  full?: boolean;
}) {
  return (
    <label className={`block ${props.full ? "sm:col-span-2" : ""}`}>
      <span className="block text-[10px] uppercase tracking-[0.3em] text-muted mb-2">
        {props.label}
        {props.required && " *"}
      </span>
      <input
        name={props.name}
        type={props.type ?? "text"}
        defaultValue={props.defaultValue}
        required={props.required}
        placeholder={props.placeholder}
        className="w-full h-12 px-4 border border-ink/20 bg-warm-white text-ink focus:border-gold focus:outline-none"
        data-testid={`input-${props.name}`}
      />
    </label>
  );
}

function AssetSlot(props: {
  label: string;
  url?: string | null;
  busy: boolean;
  onPick: () => void;
  onRemove: () => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  testId: string;
}) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.3em] text-muted mb-3">{props.label}</p>
      <div className="aspect-square w-full max-w-[180px] border border-ink/20 bg-warm-white/50 flex items-center justify-center overflow-hidden mb-3">
        {props.url ? (
          <img
            src={props.url}
            alt={props.label}
            className="w-full h-full object-cover"
            data-testid={`img-${props.testId}`}
          />
        ) : (
          <span className="text-xs text-muted">No image</span>
        )}
      </div>
      <input
        ref={props.inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={props.onChange}
        data-testid={`file-${props.testId}`}
      />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={props.onPick}
          disabled={props.busy}
          className="h-9 px-4 bg-ink text-warm-white text-[10px] uppercase tracking-[0.3em] hover:bg-ink/90 transition-colors disabled:opacity-50"
          data-testid={`button-upload-${props.testId}`}
        >
          {props.busy ? "Uploading…" : props.url ? "Replace" : "Upload"}
        </button>
        {props.url && (
          <button
            type="button"
            onClick={props.onRemove}
            disabled={props.busy}
            className="h-9 px-4 border border-ink/30 text-ink text-[10px] uppercase tracking-[0.3em] hover:bg-ink/5 transition-colors disabled:opacity-50"
            data-testid={`button-remove-${props.testId}`}
          >
            Remove
          </button>
        )}
      </div>
    </div>
  );
}
