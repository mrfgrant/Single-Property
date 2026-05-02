import React, { useState } from "react";
import { Search, CheckCircle2, XCircle, Loader2, Globe, Link2 } from "lucide-react";
import { api, type ExampleListing } from "@/lib/api";

interface SearchResult {
  domain: string;
  available: boolean;
}

interface Props {
  listings: ExampleListing[];
  preselectedListingId?: string | null;
  onDone: () => void;
}

export default function DomainSearch({ listings, preselectedListingId, onDone }: Props) {
  const [mode, setMode] = useState<"candidate" | "address">("candidate");
  const [candidateInput, setCandidateInput] = useState("");
  const [addressInput, setAddressInput] = useState("");
  const [cityInput, setCityInput] = useState("Augusta");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");

  const [actionDomain, setActionDomain] = useState<string | null>(null);
  const [actionType, setActionType] = useState<"register" | "assign" | null>(null);
  const [assignListingId, setAssignListingId] = useState(preselectedListingId ?? "");
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState("");
  const [actionSuccess, setActionSuccess] = useState("");

  const handleSearch = async () => {
    setResults([]);
    setSearchError("");
    setSearching(true);
    try {
      const body =
        mode === "candidate"
          ? { domain: candidateInput.trim() }
          : { address: addressInput.trim(), city: cityInput.trim() };
      const res = await api.domains.search(body);
      setResults(res.results);
    } catch (e: any) {
      setSearchError(e.message);
    } finally {
      setSearching(false);
    }
  };

  const openAction = (domain: string, type: "register" | "assign") => {
    setActionDomain(domain);
    setActionType(type);
    setActionError("");
    setActionSuccess("");
    if (!assignListingId && listings.length > 0) {
      setAssignListingId(listings[0].id);
    }
  };

  const handleAction = async () => {
    if (!actionDomain || !actionType) return;
    setActionLoading(true);
    setActionError("");
    setActionSuccess("");
    try {
      if (actionType === "register") {
        await api.domains.register({ domain: actionDomain });
        setActionSuccess(`${actionDomain} registered successfully.`);
      } else {
        if (!assignListingId) { setActionError("Select a listing to assign."); setActionLoading(false); return; }
        await api.domains.assign({ domain: actionDomain, listingId: assignListingId });
        setActionSuccess(`${actionDomain} assigned successfully.`);
      }
    } catch (e: any) {
      setActionError(e.message);
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-6 py-8">
      <h2 className="text-xl font-semibold text-gray-900 mb-1">Domain Search</h2>
      <p className="text-sm text-gray-500 mb-6">Check availability then register or assign a domain to a listing.</p>

      {/* Mode toggle */}
      <div className="flex gap-2 mb-5">
        <button
          onClick={() => setMode("candidate")}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${mode === "candidate" ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
        >
          Search by domain
        </button>
        <button
          onClick={() => setMode("address")}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${mode === "address" ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
        >
          Generate from address
        </button>
      </div>

      {/* Inputs */}
      {mode === "candidate" ? (
        <div className="flex gap-2 mb-4">
          <input
            type="text"
            placeholder="e.g. 412magnoliadrive.com"
            value={candidateInput}
            onChange={(e) => setCandidateInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="flex-1 h-10 px-3 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-gray-400"
          />
          <button
            onClick={handleSearch}
            disabled={searching || !candidateInput.trim()}
            className="h-10 px-4 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 disabled:opacity-40 flex items-center gap-2"
          >
            {searching ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
            Check
          </button>
        </div>
      ) : (
        <div className="space-y-2 mb-4">
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Street address (e.g. 412 Magnolia Drive)"
              value={addressInput}
              onChange={(e) => setAddressInput(e.target.value)}
              className="flex-1 h-10 px-3 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-gray-400"
            />
            <input
              type="text"
              placeholder="City"
              value={cityInput}
              onChange={(e) => setCityInput(e.target.value)}
              className="w-36 h-10 px-3 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-gray-400"
            />
          </div>
          <button
            onClick={handleSearch}
            disabled={searching || !addressInput.trim() || !cityInput.trim()}
            className="h-10 px-4 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 disabled:opacity-40 flex items-center gap-2"
          >
            {searching ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
            Generate &amp; check
          </button>
        </div>
      )}

      {searchError && (
        <p className="text-sm text-red-600 mb-4">{searchError}</p>
      )}

      {/* Results */}
      {results.length > 0 && (
        <div className="space-y-2 mb-6">
          {results.map((r) => (
            <div
              key={r.domain}
              className="flex items-center justify-between bg-white border border-gray-200 rounded-lg px-4 py-3"
            >
              <div className="flex items-center gap-3">
                {r.available
                  ? <CheckCircle2 size={18} className="text-emerald-500 shrink-0" />
                  : <XCircle size={18} className="text-red-400 shrink-0" />}
                <span className="text-sm font-mono text-gray-800">{r.domain}</span>
                <span className={`text-xs font-medium ${r.available ? "text-emerald-600" : "text-red-500"}`}>
                  {r.available ? "Available" : "Taken"}
                </span>
              </div>
              {r.available && (
                <div className="flex gap-2">
                  <button
                    onClick={() => openAction(r.domain, "register")}
                    className="h-8 px-3 text-xs font-medium bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 flex items-center gap-1.5"
                  >
                    <Globe size={13} />
                    Register
                  </button>
                  <button
                    onClick={() => openAction(r.domain, "assign")}
                    className="h-8 px-3 text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 rounded-lg hover:bg-amber-100 flex items-center gap-1.5"
                  >
                    <Link2 size={13} />
                    Assign to listing
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Action panel */}
      {actionDomain && actionType && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 space-y-4">
          <p className="text-sm font-semibold text-gray-800">
            {actionType === "register" ? "Register" : "Register & assign"}: <span className="font-mono">{actionDomain}</span>
          </p>

          {actionType === "assign" && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Listing to assign</label>
              <select
                value={assignListingId}
                onChange={(e) => setAssignListingId(e.target.value)}
                className="w-full h-10 px-3 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-gray-400 bg-white"
              >
                <option value="">— select a listing —</option>
                {listings.map((l) => (
                  <option key={l.id} value={l.id}>{l.address}, {l.city}</option>
                ))}
              </select>
            </div>
          )}

          {actionSuccess && (
            <p className="text-sm text-emerald-600 font-medium">{actionSuccess}</p>
          )}
          {actionError && (
            <p className="text-sm text-red-600">{actionError}</p>
          )}

          <div className="flex gap-2">
            {!actionSuccess && (
              <button
                onClick={handleAction}
                disabled={actionLoading}
                className="h-9 px-4 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 disabled:opacity-40 flex items-center gap-2"
              >
                {actionLoading && <Loader2 size={14} className="animate-spin" />}
                {actionType === "register" ? "Register domain" : "Register & assign"}
              </button>
            )}
            <button
              onClick={() => { setActionDomain(null); setActionType(null); if (actionSuccess) onDone(); }}
              className="h-9 px-4 text-sm text-gray-500 rounded-lg hover:bg-gray-100"
            >
              {actionSuccess ? "Done" : "Cancel"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
