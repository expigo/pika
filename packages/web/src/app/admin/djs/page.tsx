"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { VibeBadge } from "@/components/ui/VibeBadge";
import { AdminApiError, type AdminDj, approveDj, createDj, getDjs, rejectDj } from "@/lib/admin";

const statusVariant = (s: string) =>
  s === "approved" ? "green" : s === "pending" ? "amber" : s === "rejected" ? "red" : "slate";

export default function AdminDjsPage() {
  const [djs, setDjs] = useState<AdminDj[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Add-DJ form (uses the admin createUser path — does NOT log the admin out).
  const [addEmail, setAddEmail] = useState("");
  const [addName, setAddName] = useState("");
  const [addPassword, setAddPassword] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [addOk, setAddOk] = useState<string | null>(null);

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

  const act = async (id: string, fn: (id: string) => Promise<unknown>) => {
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

  const addDj = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdding(true);
    setAddError(null);
    setAddOk(null);
    try {
      await createDj({
        email: addEmail.trim(),
        displayName: addName.trim(),
        password: addPassword,
      });
      setAddOk(`Added ${addName.trim()} — you're still signed in as admin.`);
      setAddEmail("");
      setAddName("");
      setAddPassword("");
      await load();
    } catch (err) {
      setAddError(err instanceof AdminApiError ? err.message : "Failed to create DJ.");
    } finally {
      setAdding(false);
    }
  };

  if (!djs) return <p className="text-slate-500">{error ?? "Loading…"}</p>;

  const input =
    "rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-purple-500 focus:outline-none";

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">DJ accounts</h1>
      {error && <p className="text-sm text-red-400">{error}</p>}

      <form onSubmit={addDj} className="space-y-3 rounded-2xl bg-slate-900 p-4">
        <div className="text-sm font-medium text-slate-200">Add a DJ</div>
        <div className="flex flex-wrap gap-3">
          <input
            value={addName}
            onChange={(e) => setAddName(e.target.value)}
            placeholder="Display name"
            aria-label="Display name"
            required
            className={`${input} flex-1`}
          />
          <input
            type="email"
            value={addEmail}
            onChange={(e) => setAddEmail(e.target.value)}
            placeholder="Email"
            aria-label="Email"
            required
            className={`${input} flex-1`}
          />
          <input
            type="password"
            value={addPassword}
            onChange={(e) => setAddPassword(e.target.value)}
            placeholder="Temp password (min 8)"
            aria-label="Password"
            minLength={8}
            required
            className={`${input} flex-1`}
          />
          <button
            type="submit"
            disabled={adding}
            className="rounded-full bg-purple-600 px-5 py-2 text-sm font-semibold disabled:opacity-50"
          >
            {adding ? "Adding…" : "Add DJ"}
          </button>
        </div>
        <p className="text-xs text-slate-500">
          Created as <strong>approved</strong> via admin tools — this does <em>not</em> sign you out
          (unlike public registration). Share the temp password with the DJ.
        </p>
        {addError && <p className="text-sm text-amber-300">{addError}</p>}
        {addOk && <p className="text-sm text-emerald-300">{addOk}</p>}
      </form>

      <div className="divide-y divide-white/[0.04] rounded-2xl bg-slate-900">
        {djs.map((dj) => (
          <div key={dj.id} className="flex items-center justify-between gap-4 px-5 py-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                {dj.slug ? (
                  <Link
                    href={`/dj/${dj.slug}`}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Open ${dj.displayName}'s booth`}
                    className="font-semibold text-white underline-offset-2 hover:text-purple-300 hover:underline"
                  >
                    {dj.displayName}
                  </Link>
                ) : (
                  <span className="font-semibold text-white">{dj.displayName}</span>
                )}
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
