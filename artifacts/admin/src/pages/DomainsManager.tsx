import React, { useEffect, useState } from "react";
import {
  Globe, RefreshCw, Loader2, ChevronRight, Plus, Trash2, X, AlertCircle,
} from "lucide-react";
import { api } from "@/lib/api";

interface DomainEntry {
  domain: string;
  registeredAt: string | null;
  expiresAt: string | null;
  autoRenew: boolean | null;
  zoneId: string | null;
  notes: string | null;
  assignedTo: { listingId: string; slug: string; address: string; city: string } | null;
  source: "cloudflare" | "local";
}

interface DnsRecord {
  id: string;
  type: string;
  name: string;
  content: string;
  proxied: boolean;
  ttl: number;
}

export default function DomainsManager() {
  const [domains, setDomains] = useState<DomainEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [selectedDomain, setSelectedDomain] = useState<string | null>(null);
  const [dnsRecords, setDnsRecords] = useState<DnsRecord[]>([]);
  const [dnsNameServers, setDnsNameServers] = useState<string[]>([]);
  const [dnsLoading, setDnsLoading] = useState(false);
  const [dnsError, setDnsError] = useState("");

  const [showAddForm, setShowAddForm] = useState(false);
  const [newType, setNewType] = useState<"A" | "TXT">("A");
  const [newName, setNewName] = useState("@");
  const [newContent, setNewContent] = useState("");
  const [newTtl, setNewTtl] = useState(300);
  const [newProxied, setNewProxied] = useState(false);
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState("");

  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadDomains = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api.domains.list();
      setDomains(res.domains);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadDomains(); }, []);

  const openDns = async (domain: string) => {
    setSelectedDomain(domain);
    setDnsRecords([]);
    setDnsNameServers([]);
    setDnsError("");
    setDnsLoading(true);
    setShowAddForm(false);
    try {
      const res = await api.domains.listDns(domain);
      setDnsRecords(res.records);
      setDnsNameServers(res.nameServers ?? []);
    } catch (e: any) {
      setDnsError(e.message);
    } finally {
      setDnsLoading(false);
    }
  };

  const handleAddRecord = async () => {
    if (!selectedDomain || !newContent.trim()) return;
    setAddLoading(true);
    setAddError("");
    try {
      await api.domains.addDns(selectedDomain, {
        type: newType,
        name: newName || "@",
        content: newContent.trim(),
        ttl: newTtl,
        proxied: newProxied,
      });
      setShowAddForm(false);
      setNewContent("");
      setNewName("@");
      await openDns(selectedDomain);
    } catch (e: any) {
      setAddError(e.message);
    } finally {
      setAddLoading(false);
    }
  };

  const handleDeleteRecord = async (recordId: string) => {
    if (!selectedDomain) return;
    if (!confirm("Delete this DNS record?")) return;
    setDeletingId(recordId);
    try {
      await api.domains.deleteDns(selectedDomain, recordId);
      setDnsRecords((prev) => prev.filter((r) => r.id !== recordId));
    } catch (e: any) {
      alert("Failed: " + e.message);
    } finally {
      setDeletingId(null);
    }
  };

  const formatDate = (s: string | null) => {
    if (!s) return "—";
    return new Date(s).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  };

  return (
    <div className="px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Domains</h2>
          <p className="text-sm text-gray-500 mt-0.5">Manage registered domains and their DNS records.</p>
        </div>
        <button
          onClick={loadDomains}
          disabled={loading}
          className="flex items-center gap-2 h-9 px-3 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg mb-6">
          <AlertCircle size={15} />
          {error}
        </div>
      )}

      {loading && (
        <div className="text-center py-16 text-gray-400 text-sm flex items-center justify-center gap-2">
          <Loader2 size={16} className="animate-spin" />
          Loading domains…
        </div>
      )}

      {!loading && domains.length === 0 && !error && (
        <div className="text-center py-16 text-gray-400 text-sm">
          No domains registered yet. Use Domain Search to register one.
        </div>
      )}

      {!loading && domains.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Domain list */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
            <div className="px-4 py-3 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wide">
              {domains.length} domain{domains.length !== 1 ? "s" : ""}
            </div>
            <div className="divide-y divide-gray-100">
              {domains.map((d) => (
                <button
                  key={d.domain}
                  onClick={() => openDns(d.domain)}
                  className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors flex items-center justify-between group ${selectedDomain === d.domain ? "bg-amber-50" : ""}`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Globe size={14} className="text-gray-400 shrink-0" />
                      <span className="text-sm font-mono font-medium text-gray-800 truncate">{d.domain}</span>
                    </div>
                    {d.assignedTo && (
                      <p className="text-xs text-amber-600 mt-0.5 pl-5">
                        → {d.assignedTo.address}
                      </p>
                    )}
                    {!d.assignedTo && d.source === "local" && (
                      <p className="text-xs text-gray-400 mt-0.5 pl-5">Standalone</p>
                    )}
                    {d.expiresAt && (
                      <p className="text-xs text-gray-400 mt-0.5 pl-5">Expires {formatDate(d.expiresAt)}</p>
                    )}
                  </div>
                  <ChevronRight size={15} className="text-gray-300 group-hover:text-gray-500 shrink-0" />
                </button>
              ))}
            </div>
          </div>

          {/* DNS panel */}
          {selectedDomain && (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
              <div className="px-4 py-3 border-b border-gray-100">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-gray-800 font-mono">{selectedDomain}</p>
                    <p className="text-xs text-gray-400">DNS Records</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setShowAddForm(true)}
                      className="flex items-center gap-1.5 h-8 px-3 text-xs font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-800"
                    >
                      <Plus size={12} />
                      Add record
                    </button>
                    <button onClick={() => setSelectedDomain(null)} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
                      <X size={15} />
                    </button>
                  </div>
                </div>
                {dnsNameServers.length > 0 && (
                  <div className="mt-2.5 p-2.5 bg-blue-50 border border-blue-200 rounded-lg">
                    <p className="text-xs font-semibold text-blue-800 mb-1">Point your domain registrar to these nameservers:</p>
                    {dnsNameServers.map((ns) => (
                      <p key={ns} className="text-xs font-mono text-blue-700">NS &nbsp; {ns}</p>
                    ))}
                  </div>
                )}
              </div>

              {dnsLoading && (
                <div className="flex items-center justify-center gap-2 py-10 text-gray-400 text-sm">
                  <Loader2 size={15} className="animate-spin" />
                  Loading records…
                </div>
              )}

              {dnsError && (
                <div className="m-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                  {dnsError}
                </div>
              )}

              {/* Add record form */}
              {showAddForm && (
                <div className="px-4 py-4 bg-gray-50 border-b border-gray-200 space-y-3">
                  <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">New record</p>
                  <div className="flex gap-2">
                    <select
                      value={newType}
                      onChange={(e) => setNewType(e.target.value as "A" | "TXT")}
                      className="w-20 h-9 px-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none"
                    >
                      <option value="A">A</option>
                      <option value="TXT">TXT</option>
                    </select>
                    <input
                      type="text"
                      placeholder="Name (@, www, …)"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      className="w-32 h-9 px-3 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-gray-400"
                    />
                    <input
                      type="number"
                      placeholder="TTL"
                      value={newTtl}
                      onChange={(e) => setNewTtl(Number(e.target.value))}
                      className="w-20 h-9 px-3 border border-gray-200 rounded-lg text-sm focus:outline-none"
                    />
                  </div>
                  <input
                    type="text"
                    placeholder={newType === "A" ? "IP address (e.g. 1.2.3.4)" : "TXT value (e.g. v=spf1 include:… ~all)"}
                    value={newContent}
                    onChange={(e) => setNewContent(e.target.value)}
                    className="w-full h-9 px-3 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-gray-400"
                  />
                  {newType === "A" && (
                    <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                      <input type="checkbox" checked={newProxied} onChange={(e) => setNewProxied(e.target.checked)} className="rounded" />
                      Proxied through Cloudflare
                    </label>
                  )}
                  {addError && <p className="text-sm text-red-600">{addError}</p>}
                  <div className="flex gap-2">
                    <button
                      onClick={handleAddRecord}
                      disabled={addLoading || !newContent.trim()}
                      className="h-8 px-4 bg-gray-900 text-white text-xs font-medium rounded-lg hover:bg-gray-800 disabled:opacity-40 flex items-center gap-1.5"
                    >
                      {addLoading && <Loader2 size={12} className="animate-spin" />}
                      Save record
                    </button>
                    <button onClick={() => setShowAddForm(false)} className="h-8 px-3 text-xs text-gray-500 rounded-lg hover:bg-gray-100">Cancel</button>
                  </div>
                </div>
              )}

              {!dnsLoading && !dnsError && (
                <div className="divide-y divide-gray-100 overflow-auto max-h-[calc(100vh-260px)]">
                  {dnsRecords.length === 0 && (
                    <p className="text-center py-10 text-sm text-gray-400">No DNS records found.</p>
                  )}
                  {dnsRecords.map((r) => (
                    <div key={r.id} className="flex items-start justify-between px-4 py-3 hover:bg-gray-50 group">
                      <div className="min-w-0 space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                            r.type === "A" ? "bg-blue-50 text-blue-700" :
                            r.type === "TXT" ? "bg-purple-50 text-purple-700" :
                            r.type === "CNAME" ? "bg-amber-50 text-amber-700" :
                            "bg-gray-100 text-gray-600"
                          }`}>{r.type}</span>
                          <span className="text-sm font-mono text-gray-700 truncate">{r.name}</span>
                          {r.proxied && (
                            <span className="text-xs text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded">Proxied</span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 font-mono pl-1 truncate max-w-[280px]">{r.content}</p>
                        <p className="text-xs text-gray-400 pl-1">TTL {r.ttl === 1 ? "Auto" : r.ttl}</p>
                      </div>
                      {r.type !== "CNAME" && (
                        <button
                          onClick={() => handleDeleteRecord(r.id)}
                          disabled={deletingId === r.id}
                          className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100 transition-all ml-2 shrink-0 disabled:opacity-30"
                          title="Delete record"
                        >
                          {deletingId === r.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                        </button>
                      )}
                      {r.type === "CNAME" && (
                        <span className="text-xs text-gray-300 ml-2 shrink-0 italic">auto</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
