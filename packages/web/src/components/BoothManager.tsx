"use client";

import { CalendarPlus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  addGig,
  getEmailPreferences,
  getMyBooth,
  type MyBooth,
  removeGig,
  updateBooth,
  updateEmailPreferences,
} from "@/lib/djLive";
import { trackEvent } from "@/lib/events";

const BIO_MAX = 500;

/**
 * Slice C — the DJ's Booth editor (rendered on /dj/live beside ProfileManager): bio, the
 * public follower-count toggle, upcoming gigs (structured one-liners — deliberately not an
 * organizer model), and the set-digest email opt-in (explicit marketing consent).
 */
export function BoothManager() {
  const [booth, setBooth] = useState<MyBooth | null>(null);
  const [bioDraft, setBioDraft] = useState("");
  const [bioSaved, setBioSaved] = useState(true);
  const [savingBio, setSavingBio] = useState(false);
  const [digest, setDigest] = useState<boolean | null>(null);
  const [gigDate, setGigDate] = useState("");
  const [gigTitle, setGigTitle] = useState("");
  const [gigCity, setGigCity] = useState("");
  const [gigUrl, setGigUrl] = useState("");
  const [gigBusy, setGigBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    getMyBooth()
      .then((b) => {
        setBooth(b);
        setBioDraft(b.bio ?? "");
        setBioSaved(true);
      })
      .catch(() => {});
    getEmailPreferences()
      .then((p) => setDigest(p.djDigest))
      .catch(() => {});
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const saveBio = useCallback(async () => {
    setSavingBio(true);
    setError(null);
    try {
      await updateBooth({ bio: bioDraft.trim() });
      setBooth((b) => (b ? { ...b, bio: bioDraft.trim() || null } : b));
      setBioSaved(true);
    } catch {
      setError("Couldn't save the bio — try again.");
    } finally {
      setSavingBio(false);
    }
  }, [bioDraft]);

  const toggleCount = useCallback(async () => {
    if (!booth) return;
    const next = !booth.showFollowerCount;
    setBooth({ ...booth, showFollowerCount: next }); // optimistic
    try {
      await updateBooth({ showFollowerCount: next });
    } catch {
      setBooth(booth);
    }
  }, [booth]);

  const toggleDigest = useCallback(async () => {
    if (digest === null) return;
    const next = !digest;
    setDigest(next); // optimistic
    try {
      await updateEmailPreferences({ djDigest: next });
      trackEvent("email_prefs_updated", { djDigest: next });
    } catch {
      setDigest(digest);
    }
  }, [digest]);

  const submitGig = useCallback(async () => {
    if (!gigDate || !gigTitle.trim()) return;
    setGigBusy(true);
    setError(null);
    try {
      await addGig({
        date: gigDate,
        title: gigTitle.trim(),
        ...(gigCity.trim() ? { city: gigCity.trim() } : {}),
        ...(gigUrl.trim() ? { url: gigUrl.trim() } : {}),
      });
      setGigDate("");
      setGigTitle("");
      setGigCity("");
      setGigUrl("");
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't add that gig.");
    } finally {
      setGigBusy(false);
    }
  }, [gigDate, gigTitle, gigCity, gigUrl, load]);

  const deleteGig = useCallback(
    async (id: number) => {
      setBooth((b) => (b ? { ...b, gigs: b.gigs.filter((g) => g.id !== id) } : b));
      try {
        await removeGig(id);
      } catch {
        load();
      }
    },
    [load],
  );

  const today = new Date().toISOString().slice(0, 10);

  return (
    <section className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
      <h2 className="mb-4 text-xs font-black uppercase tracking-widest text-slate-300">My booth</h2>

      {/* Bio */}
      <div className="mb-6">
        <div className="mb-2 flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-slate-500">
          <span>Bio — shown on your public booth</span>
          <span className={bioDraft.length > BIO_MAX ? "text-red-400" : ""}>
            {bioDraft.length}/{BIO_MAX}
          </span>
        </div>
        <textarea
          value={bioDraft}
          onChange={(e) => {
            setBioDraft(e.target.value);
            setBioSaved(false);
          }}
          maxLength={BIO_MAX}
          rows={3}
          placeholder="Who you are, what you play…"
          aria-label="Booth bio"
          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-200 placeholder:text-slate-600 focus:border-purple-500 focus:outline-none resize-y"
        />
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            onClick={saveBio}
            disabled={savingBio || bioSaved}
            className="rounded-lg bg-purple-600 px-4 py-1.5 text-[10px] font-bold uppercase tracking-widest text-white hover:bg-purple-500 disabled:opacity-40"
          >
            {savingBio ? "Saving…" : bioSaved ? "Saved" : "Save bio"}
          </button>
        </div>
      </div>

      {/* Toggles */}
      {booth && (
        <div className="mb-3 flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2">
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
            Show follower count publicly
            <span className="ml-2 normal-case text-slate-500">
              ({booth.followerCount} follower{booth.followerCount === 1 ? "" : "s"})
            </span>
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={booth.showFollowerCount}
            aria-label="Show follower count publicly"
            onClick={toggleCount}
            className={`rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-widest ${
              booth.showFollowerCount
                ? "bg-emerald-600/15 text-emerald-400 hover:bg-emerald-600/25"
                : "bg-slate-800 text-slate-500 hover:bg-slate-700"
            }`}
          >
            {booth.showFollowerCount ? "Public" : "Hidden"}
          </button>
        </div>
      )}
      {digest !== null && (
        <div className="mb-6 flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2">
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
            Email me a set digest the morning after
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={digest}
            aria-label="Set digest emails"
            onClick={toggleDigest}
            className={`rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-widest ${
              digest
                ? "bg-emerald-600/15 text-emerald-400 hover:bg-emerald-600/25"
                : "bg-slate-800 text-slate-500 hover:bg-slate-700"
            }`}
          >
            {digest ? "On" : "Off"}
          </button>
        </div>
      )}

      {/* Gigs */}
      <div>
        <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-500">
          <CalendarPlus size={12} /> Upcoming gigs — dancers plan around these
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input
            type="date"
            value={gigDate}
            onChange={(e) => setGigDate(e.target.value)}
            aria-label="Gig date"
            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-200 focus:border-purple-500 focus:outline-none [color-scheme:dark]"
          />
          <input
            type="text"
            value={gigTitle}
            onChange={(e) => setGigTitle(e.target.value)}
            maxLength={120}
            placeholder="Event / venue"
            aria-label="Gig title"
            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-200 placeholder:text-slate-600 focus:border-purple-500 focus:outline-none"
          />
          <input
            type="text"
            value={gigCity}
            onChange={(e) => setGigCity(e.target.value)}
            maxLength={80}
            placeholder="City (optional)"
            aria-label="Gig city"
            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-200 placeholder:text-slate-600 focus:border-purple-500 focus:outline-none"
          />
          <input
            type="url"
            value={gigUrl}
            onChange={(e) => setGigUrl(e.target.value)}
            maxLength={300}
            placeholder="Link (optional)"
            aria-label="Gig link"
            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-200 placeholder:text-slate-600 focus:border-purple-500 focus:outline-none"
          />
        </div>
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            onClick={submitGig}
            disabled={gigBusy || !gigDate || gigTitle.trim().length === 0}
            className="rounded-lg bg-purple-600 px-4 py-1.5 text-[10px] font-bold uppercase tracking-widest text-white hover:bg-purple-500 disabled:opacity-40"
          >
            Add gig
          </button>
        </div>
        {error && <p className="mt-2 text-[10px] italic text-red-400">{error}</p>}
        <ul className="mt-3 space-y-1.5">
          {(booth?.gigs ?? []).map((g) => {
            const past = g.date < today;
            return (
              <li
                key={g.id}
                className={`flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 ${past ? "opacity-50" : ""}`}
              >
                <div className="min-w-0">
                  <div className="truncate text-xs font-medium text-slate-200">{g.title}</div>
                  <div className="text-[10px] text-slate-500">
                    {g.date}
                    {g.city ? ` · ${g.city}` : ""}
                    {past ? " · past (hidden publicly)" : ""}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => deleteGig(g.id)}
                  aria-label={`Remove gig ${g.title}`}
                  className="ml-3 shrink-0 text-slate-500 hover:text-red-400"
                >
                  <Trash2 size={14} />
                </button>
              </li>
            );
          })}
          {booth && booth.gigs.length === 0 && (
            <li className="text-[11px] text-slate-600">No gigs posted yet.</li>
          )}
        </ul>
      </div>
    </section>
  );
}
