"use client";

import { Eye, EyeOff, ListMusic, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  addPlaylist,
  type DjUser,
  getMyPlaylists,
  getMySessions,
  type MyPlaylist,
  type MySession,
  removePlaylist,
  setSessionPublished,
} from "@/lib/djLive";

/**
 * Slice 5 — the DJ's public-profile management panel (rendered on /dj/live for an approved DJ). Lets
 * them hide/show each session on their public /dj/[slug] page and add/remove embedded Spotify playlists.
 */
export function ProfileManager({ user }: { user: DjUser }) {
  const [sessions, setSessions] = useState<MySession[]>([]);
  const [playlists, setPlaylists] = useState<MyPlaylist[]>([]);
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    getMySessions()
      .then((r) => setSessions(r.sessions))
      .catch(() => {});
    getMyPlaylists()
      .then((r) => setPlaylists(r.playlists))
      .catch(() => {});
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const toggle = useCallback(async (s: MySession) => {
    const next = !s.published;
    setSessions((prev) => prev.map((x) => (x.id === s.id ? { ...x, published: next } : x)));
    try {
      await setSessionPublished(s.id, next);
    } catch {
      setSessions((prev) =>
        prev.map((x) => (x.id === s.id ? { ...x, published: s.published } : x)),
      );
    }
  }, []);

  const add = useCallback(async () => {
    if (!url.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await addPlaylist(url.trim());
      setUrl("");
      const r = await getMyPlaylists();
      setPlaylists(r.playlists);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't add that playlist.");
    } finally {
      setBusy(false);
    }
  }, [url]);

  const remove = useCallback(
    async (id: number) => {
      setPlaylists((prev) => prev.filter((p) => p.id !== id));
      try {
        await removePlaylist(id);
      } catch {
        load();
      }
    },
    [load],
  );

  return (
    <section className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xs font-black uppercase tracking-widest text-slate-300">My profile</h2>
        {user.slug && (
          <a
            href={`/dj/${user.slug}`}
            target="_blank"
            rel="noreferrer"
            className="text-[10px] font-bold uppercase tracking-widest text-purple-400 hover:text-purple-300"
          >
            View public →
          </a>
        )}
      </div>

      {/* Playlists */}
      <div className="mb-6">
        <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-500">
          <ListMusic size={12} /> Spotify playlists
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Paste a Spotify playlist link…"
            aria-label="Spotify playlist link"
            className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-200 placeholder:text-slate-600 focus:border-purple-500 focus:outline-none"
          />
          <button
            type="button"
            onClick={add}
            disabled={busy || url.trim().length === 0}
            className="rounded-lg bg-purple-600 px-4 text-xs font-bold text-white hover:bg-purple-500 disabled:opacity-40"
          >
            Add
          </button>
        </div>
        {error && <p className="mt-2 text-[10px] italic text-red-400">{error}</p>}
        <ul className="mt-3 space-y-1.5">
          {playlists.map((p) => (
            <li
              key={p.id}
              className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2"
            >
              <a
                href={p.url}
                target="_blank"
                rel="noreferrer"
                className="truncate text-xs text-slate-300 hover:text-emerald-400"
              >
                {p.url}
              </a>
              <button
                type="button"
                onClick={() => remove(p.id)}
                aria-label="Remove playlist"
                className="ml-3 shrink-0 text-slate-500 hover:text-red-400"
              >
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      </div>

      {/* Sessions */}
      <div>
        <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-500">
          My sets — toggle what's public
        </div>
        <ul className="space-y-1.5">
          {sessions.map((s) => (
            <li
              key={s.id}
              className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2"
            >
              <div className="min-w-0">
                <div className="truncate text-xs font-medium text-slate-200">
                  {s.startedAt ? new Date(s.startedAt).toLocaleDateString() : "Session"}
                </div>
                <div className="text-[10px] text-slate-500">{s.trackCount} tracks</div>
              </div>
              <button
                type="button"
                onClick={() => toggle(s)}
                aria-label={s.published ? "Hide from profile" : "Show on profile"}
                className={`ml-3 flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-widest ${
                  s.published
                    ? "bg-emerald-600/15 text-emerald-400 hover:bg-emerald-600/25"
                    : "bg-slate-800 text-slate-500 hover:bg-slate-700"
                }`}
              >
                {s.published ? <Eye size={12} /> : <EyeOff size={12} />}
                {s.published ? "Public" : "Hidden"}
              </button>
            </li>
          ))}
          {sessions.length === 0 && (
            <li className="text-[11px] text-slate-600">No recorded sets yet.</li>
          )}
        </ul>
      </div>
    </section>
  );
}
