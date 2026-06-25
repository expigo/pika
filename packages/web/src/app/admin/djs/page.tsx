"use client";

import { useCallback, useEffect, useState } from "react";
import { VibeBadge } from "@/components/ui/VibeBadge";
import { type AdminDj, approveDj, getDjs, rejectDj } from "@/lib/admin";

const statusVariant = (s: string) =>
  s === "approved" ? "green" : s === "pending" ? "amber" : s === "rejected" ? "red" : "slate";

export default function AdminDjsPage() {
  const [djs, setDjs] = useState<AdminDj[] | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setDjs(await getDjs());
    } catch {
      setError("Failed to load DJs.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (id: number, fn: (id: number) => Promise<unknown>) => {
    setBusyId(id);
    setError(null);
    try {
      await fn(id);
      await load();
    } catch {
      setError("Action failed.");
    } finally {
      setBusyId(null);
    }
  };

  if (!djs) return <p className="text-slate-500">{error ?? "Loading…"}</p>;

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">DJ accounts</h1>
      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="divide-y divide-white/[0.04] rounded-2xl bg-slate-900">
        {djs.map((dj) => (
          <div key={dj.id} className="flex items-center justify-between gap-4 px-5 py-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-white">{dj.displayName}</span>
                <VibeBadge variant={statusVariant(dj.status)}>{dj.status}</VibeBadge>
                {dj.role === "admin" && <VibeBadge variant="purple">admin</VibeBadge>}
                {dj.spotifyStatus && (
                  <VibeBadge variant={dj.spotifyStatus === "active" ? "green" : "amber"}>
                    spotify
                  </VibeBadge>
                )}
              </div>
              <div className="truncate text-sm text-slate-500">{dj.email}</div>
            </div>
            <div className="flex shrink-0 gap-2">
              {dj.status !== "approved" && (
                <button
                  type="button"
                  disabled={busyId === dj.id}
                  onClick={() => act(dj.id, approveDj)}
                  className="rounded-full bg-emerald-600 px-4 py-1.5 text-sm font-semibold disabled:opacity-50"
                >
                  Approve
                </button>
              )}
              {dj.status !== "rejected" && (
                <button
                  type="button"
                  disabled={busyId === dj.id}
                  onClick={() => act(dj.id, rejectDj)}
                  className="rounded-full border border-red-500/40 px-4 py-1.5 text-sm text-red-300 disabled:opacity-50"
                >
                  Reject
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
