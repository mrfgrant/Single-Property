import React, { useState } from "react";
import { api } from "@/lib/api";
import { X, Sparkles, CheckCircle2, AlertCircle, ExternalLink } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

interface Result {
  previewUrl: string;
  activateUrl: string;
  emailStatus: "sent" | "skipped" | "failed";
  emailError?: string;
  address: string;
  agentEmail: string;
}

export default function SimulatorModal({ open, onClose, onCreated }: Props) {
  const [address, setAddress] = useState("123 Oak Ridge Lane");
  const [city, setCity] = useState("Augusta");
  const [state, setState] = useState("GA");
  const [zip, setZip] = useState("30909");
  const [priceUsd, setPriceUsd] = useState("325000");
  const [beds, setBeds] = useState("4");
  const [baths, setBaths] = useState("3");
  const [sqft, setSqft] = useState("2200");
  const [agentFirstName, setAgentFirstName] = useState("");
  const [agentLastName, setAgentLastName] = useState("");
  const [agentEmail, setAgentEmail] = useState("");
  const [agentPhone, setAgentPhone] = useState("");
  const [agentBrokerage, setAgentBrokerage] = useState("");
  const [shouldSendEmail, setShouldSendEmail] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);

  if (!open) return null;

  const reset = () => {
    setResult(null);
    setError("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await api.simulator.run({
        address,
        city,
        state,
        zip: zip || undefined,
        priceUsd: priceUsd ? parseInt(priceUsd, 10) : undefined,
        beds: beds ? parseInt(beds, 10) : undefined,
        baths: baths ? parseFloat(baths) : undefined,
        sqft: sqft ? parseInt(sqft, 10) : undefined,
        agentFirstName,
        agentLastName,
        agentEmail,
        agentPhone: agentPhone || undefined,
        agentBrokerage: agentBrokerage || undefined,
        sendEmail: shouldSendEmail,
      });
      setResult({
        previewUrl: res.previewUrl,
        activateUrl: res.activateUrl,
        emailStatus: res.emailStatus,
        emailError: res.emailError,
        address,
        agentEmail,
      });
      onCreated();
    } catch (err: any) {
      setError(err.message ?? "Failed to simulate");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center overflow-y-auto p-6">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl my-12 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <Sparkles size={18} className="text-amber-500" />
            <h3 className="font-semibold text-gray-900">Simulate MLS Event</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700">
            <X size={20} />
          </button>
        </div>

        {!result && (
          <form onSubmit={handleSubmit} className="p-6 space-y-5">
            <p className="text-sm text-gray-600 leading-relaxed">
              Pretend a new MLS listing just appeared under this agent. We'll auto-build
              a preview site and email the agent a cold-outreach message with a link to view
              and activate it.
            </p>

            <div className="space-y-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Listing</p>
              <input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                required
                placeholder="Street address"
                className="w-full h-10 px-3 border border-gray-200 rounded-lg text-sm"
              />
              <div className="grid grid-cols-3 gap-2">
                <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="City" className="col-span-2 h-10 px-3 border border-gray-200 rounded-lg text-sm" />
                <input value={state} onChange={(e) => setState(e.target.value)} placeholder="State" className="h-10 px-3 border border-gray-200 rounded-lg text-sm" />
              </div>
              <div className="grid grid-cols-4 gap-2">
                <input value={zip} onChange={(e) => setZip(e.target.value)} placeholder="ZIP" className="h-10 px-3 border border-gray-200 rounded-lg text-sm" />
                <input value={priceUsd} onChange={(e) => setPriceUsd(e.target.value)} placeholder="Price" className="h-10 px-3 border border-gray-200 rounded-lg text-sm" />
                <input value={beds} onChange={(e) => setBeds(e.target.value)} placeholder="Beds" className="h-10 px-3 border border-gray-200 rounded-lg text-sm" />
                <input value={baths} onChange={(e) => setBaths(e.target.value)} placeholder="Baths" className="h-10 px-3 border border-gray-200 rounded-lg text-sm" />
              </div>
              <input value={sqft} onChange={(e) => setSqft(e.target.value)} placeholder="Sq ft" className="w-full h-10 px-3 border border-gray-200 rounded-lg text-sm" />
            </div>

            <div className="space-y-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Agent (recipient)</p>
              <div className="grid grid-cols-2 gap-2">
                <input value={agentFirstName} onChange={(e) => setAgentFirstName(e.target.value)} required placeholder="First name" className="h-10 px-3 border border-gray-200 rounded-lg text-sm" />
                <input value={agentLastName} onChange={(e) => setAgentLastName(e.target.value)} placeholder="Last name" className="h-10 px-3 border border-gray-200 rounded-lg text-sm" />
              </div>
              <input value={agentEmail} onChange={(e) => setAgentEmail(e.target.value)} required type="email" placeholder="Agent email (where the cold email goes)" className="w-full h-10 px-3 border border-gray-200 rounded-lg text-sm" />
              <input value={agentPhone} onChange={(e) => setAgentPhone(e.target.value)} placeholder="Phone (optional)" className="w-full h-10 px-3 border border-gray-200 rounded-lg text-sm" />
              <input value={agentBrokerage} onChange={(e) => setAgentBrokerage(e.target.value)} placeholder="Brokerage (optional)" className="w-full h-10 px-3 border border-gray-200 rounded-lg text-sm" />
            </div>

            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={shouldSendEmail} onChange={(e) => setShouldSendEmail(e.target.checked)} />
              Send the cold-outreach email (uncheck to dry-run only)
            </label>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">
                {error}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
              <button type="button" onClick={onClose} className="h-10 px-4 text-sm text-gray-600 hover:bg-gray-50 rounded-lg">Cancel</button>
              <button type="submit" disabled={busy} className="h-10 px-5 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium rounded-lg disabled:opacity-50">
                {busy ? "Building site…" : "Trigger MLS event"}
              </button>
            </div>
          </form>
        )}

        {result && (
          <div className="p-6 space-y-4">
            <div className="flex items-start gap-3 bg-emerald-50 border border-emerald-200 rounded-lg p-4">
              <CheckCircle2 className="text-emerald-600 shrink-0 mt-0.5" size={20} />
              <div className="text-sm">
                <p className="font-semibold text-emerald-900">Site auto-built for {result.address}</p>
                <p className="text-emerald-700 mt-0.5">It now exists on the marketing site at the preview URL below.</p>
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Preview URL (share with agent)</p>
              <a href={result.previewUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-sm text-amber-600 hover:text-amber-700 break-all">
                {result.previewUrl}
                <ExternalLink size={13} className="shrink-0" />
              </a>
            </div>

            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Activate URL (in the email)</p>
              <a href={result.activateUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-gray-600 hover:text-amber-600 break-all">
                {result.activateUrl}
              </a>
            </div>

            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Cold-outreach email</p>
              {result.emailStatus === "sent" && (
                <p className="text-sm text-emerald-700 flex items-center gap-1.5">
                  <CheckCircle2 size={14} /> Sent to <span className="font-mono">{result.agentEmail}</span> — check the inbox
                </p>
              )}
              {result.emailStatus === "skipped" && (
                <p className="text-sm text-gray-500">Skipped (dry run)</p>
              )}
              {result.emailStatus === "failed" && (
                <div className="text-sm text-red-700">
                  <p className="flex items-center gap-1.5"><AlertCircle size={14} /> Failed to send</p>
                  {result.emailError && <p className="text-xs text-red-500 mt-1">{result.emailError}</p>}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-gray-100">
              <button onClick={() => { reset(); }} className="h-10 px-4 text-sm text-gray-600 hover:bg-gray-50 rounded-lg">Run another</button>
              <button onClick={onClose} className="h-10 px-5 bg-gray-900 hover:bg-gray-800 text-white text-sm font-medium rounded-lg">Done</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
