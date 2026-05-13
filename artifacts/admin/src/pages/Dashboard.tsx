import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import {
  Mail, MousePointerClick, DollarSign, Radio,
  TrendingUp, Clock, AlertTriangle, CheckCircle2,
  RefreshCw, Users, Home, Send
} from "lucide-react";

interface DashboardData {
  outreach: {
    sentToday: number; sent7d: number; sent30d: number;
    pendingQueue: number; failed: number; cancelled: number; suppressed: number;
  };
  clicks: {
    clicksToday: number; clicks7d: number;
    uniqueAgents7d: number; activateClicks7d: number;
  };
  revenue: {
    paidActive: number; claimedTrial: number;
    totalMlsListings: number; newListings7d: number; totalAgents: number;
  };
  mlsSync: {
    healthy: boolean; minutesSinceSync: number | null;
    lastSuccessAt: string | null; lastDeltaSyncAt: string | null;
    lastFullSyncAt: string | null; lastError: string | null;
    lastErrorAt: string | null; totalListings: number;
  } | null;
  dailySent: { day: string; count: number }[];
}

function StatCard({
  label, value, sub, icon, accent,
}: {
  label: string; value: string | number; sub?: string;
  icon: React.ReactNode; accent?: "green" | "amber" | "red" | "blue";
}) {
  const colors = {
    green: "bg-green-50 text-green-600",
    amber: "bg-amber-50 text-amber-600",
    red:   "bg-red-50 text-red-600",
    blue:  "bg-blue-50 text-blue-600",
  };
  const color = colors[accent ?? "blue"];
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 flex items-start gap-4">
      <div className={`rounded-lg p-2.5 shrink-0 ${color}`}>{icon}</div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
        <p className="text-2xl font-bold text-gray-900 mt-0.5">{value.toLocaleString()}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function Sparkline({ data }: { data: { day: string; count: number }[] }) {
  if (data.length < 2) return <div className="text-xs text-gray-400">No data yet</div>;
  const max = Math.max(...data.map(d => d.count), 1);
  const w = 220, h = 48, pad = 4;
  const points = data.map((d, i) => {
    const x = pad + (i / (data.length - 1)) * (w - pad * 2);
    const y = pad + (1 - d.count / max) * (h - pad * 2);
    return `${x},${y}`;
  }).join(" ");

  return (
    <svg width={w} height={h} className="overflow-visible">
      <polyline
        fill="none"
        stroke="#f59e0b"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
        points={points}
      />
      {data.map((d, i) => {
        const x = pad + (i / (data.length - 1)) * (w - pad * 2);
        const y = pad + (1 - d.count / max) * (h - pad * 2);
        return (
          <circle key={i} cx={x} cy={y} r="3" fill="#f59e0b" className="cursor-default">
            <title>{d.day}: {d.count} sent</title>
          </circle>
        );
      })}
    </svg>
  );
}

function timeAgo(iso: string | null): string {
  if (!iso) return "never";
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    setError("");
    try {
      const res = await api.dashboard.get();
      setData(res);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { load(); }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        <RefreshCw size={20} className="animate-spin mr-2" /> Loading…
      </div>
    );
  }
  if (error) {
    return (
      <div className="p-8 text-red-600 text-sm">Error: {error}</div>
    );
  }
  if (!data) return null;

  const { outreach, clicks, revenue, mlsSync, dailySent } = data;
  const conversionRate = outreach.sent30d > 0
    ? ((revenue.claimedTrial + revenue.paidActive) / outreach.sent30d * 100).toFixed(1)
    : null;

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Dashboard</h1>
        <button
          onClick={() => load(true)}
          disabled={refreshing}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors"
        >
          <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {/* ── 1. Cold Outreach Funnel ── */}
      <section>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
          <Mail size={13} /> Cold Outreach Funnel
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <StatCard label="Sent Today"  value={outreach.sentToday}    icon={<Send size={16} />}  accent="blue" />
          <StatCard label="Sent (7d)"   value={outreach.sent7d}        icon={<TrendingUp size={16} />} accent="blue" />
          <StatCard label="Queue"       value={outreach.pendingQueue}  icon={<Clock size={16} />} accent="amber"
            sub="pending emails" />
          <StatCard label="Suppressed"  value={outreach.suppressed}    icon={<Users size={16} />} accent="green"
            sub="opted out" />
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
              <MousePointerClick size={13} /> Click-throughs (last 7 days)
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center mb-5">
            {[
              { label: "Emails sent", value: outreach.sent7d },
              { label: "Link clicks", value: clicks.clicks7d },
              { label: "Unique agents", value: clicks.uniqueAgents7d },
              { label: "Activate clicks", value: clicks.activateClicks7d },
            ].map(({ label, value }) => (
              <div key={label}>
                <p className="text-2xl font-bold text-gray-900">{value.toLocaleString()}</p>
                <p className="text-xs text-gray-400 mt-0.5">{label}</p>
              </div>
            ))}
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-1.5">Sent per day (14 days)</p>
            <Sparkline data={dailySent} />
          </div>
        </div>
      </section>

      {/* ── 2. MLS Sync Health ── */}
      <section>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
          <Radio size={13} /> MLS Sync Health
        </h2>
        {mlsSync ? (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center gap-3 mb-4">
              {mlsSync.healthy ? (
                <span className="flex items-center gap-1.5 text-sm font-semibold text-green-600">
                  <CheckCircle2 size={16} /> Healthy
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-sm font-semibold text-red-500">
                  <AlertTriangle size={16} /> Needs attention
                </span>
              )}
              {mlsSync.minutesSinceSync !== null && (
                <span className="text-xs text-gray-400">
                  Last sync {timeAgo(mlsSync.lastSuccessAt)}
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
              <div>
                <p className="text-2xl font-bold text-gray-900">{mlsSync.totalListings.toLocaleString()}</p>
                <p className="text-xs text-gray-400 mt-0.5">Total listings</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{revenue.newListings7d.toLocaleString()}</p>
                <p className="text-xs text-gray-400 mt-0.5">New (7d)</p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-700">{timeAgo(mlsSync.lastDeltaSyncAt)}</p>
                <p className="text-xs text-gray-400 mt-0.5">Delta sync</p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-700">{timeAgo(mlsSync.lastFullSyncAt)}</p>
                <p className="text-xs text-gray-400 mt-0.5">Full sync</p>
              </div>
            </div>
            {mlsSync.lastError && (
              <div className="mt-4 rounded-lg bg-red-50 border border-red-100 p-3">
                <p className="text-xs font-semibold text-red-600 mb-0.5">
                  Last error · {timeAgo(mlsSync.lastErrorAt)}
                </p>
                <p className="text-xs text-red-500 font-mono break-all line-clamp-3">
                  {mlsSync.lastError}
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 p-5 text-sm text-gray-400">
            MLS sync not yet configured.
          </div>
        )}
      </section>

      {/* ── 3. Revenue Pipeline ── */}
      <section>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
          <DollarSign size={13} /> Revenue Pipeline
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <StatCard label="Paid Sites"    value={revenue.paidActive}    icon={<DollarSign size={16} />} accent="green"
            sub="active subscriptions" />
          <StatCard label="Claimed Trial" value={revenue.claimedTrial}  icon={<Home size={16} />} accent="amber"
            sub="not yet paid" />
          <StatCard label="Total Agents"  value={revenue.totalAgents}   icon={<Users size={16} />} accent="blue" />
          <StatCard
            label="30d Conversion"
            value={conversionRate !== null ? `${conversionRate}%` : "—"}
            icon={<TrendingUp size={16} />}
            accent="blue"
            sub="outreach → claimed"
          />
        </div>
      </section>
    </div>
  );
}
