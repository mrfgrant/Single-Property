import React, { useState } from "react";
import { setToken } from "@/lib/auth";
import { api } from "@/lib/api";

interface Props {
  onSuccess: () => void;
}

export default function Login({ onSuccess }: Props) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      setToken(password);
      await api.verifyPassword(password);
      onSuccess();
    } catch (err: any) {
      if (err.message === "UNAUTHORIZED") {
        setError("Incorrect password. Try again.");
      } else {
        setError("Could not connect to the API server. Is it running?");
      }
      setToken("");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm w-full max-w-sm p-8">
        <div className="mb-8 text-center">
          <img src="/propsite-logo.png" alt="PropSite" className="h-7 w-auto max-w-[130px] mx-auto" />
          <p className="text-sm text-gray-500 mt-1">Admin Panel</p>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
              required
              className="w-full h-11 px-3 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
              placeholder="Enter admin password"
            />
          </div>
          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={loading || !password}
            className="h-11 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors disabled:opacity-50"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <p className="text-xs text-gray-400 text-center mt-6">
          Set <code className="bg-gray-100 px-1 rounded">ADMIN_PASSWORD</code> in Replit Secrets
        </p>
      </div>
    </div>
  );
}
