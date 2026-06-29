"use client";

/**
 * Catalog seed tool (B3, admin). Owner-driven: pick a cooperating DJ, paste their Spotify profile
 * link, preview their PUBLIC playlists (read via the account-less app token — no DJ OAuth), curate,
 * and seed the chosen ones into that DJ's catalog (`curated_tracks` + `track_links`).
 */

import { useEffect, useState } from "react";
import {
  type AdminDj,
  getDjs,
  getSeedPlaylists,
  getSeedPlaylistTracks,
  type SeedPlaylist,
  type SeedTrack,
  seedCurated,
} from "@/lib/admin";

export default function AdminSeedPage() {
  const [djs, setDjs] = useState<AdminDj[]>([]);
  const [djId, setDjId] = useState("");
  const [profile, setProfile] = useState("");
  const [playlists, setPlaylists] = useState<SeedPlaylist[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [previews, setPreviews] = useState<Record<string, SeedTrack[]>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    getDjs()
      .then((d) => setDjs(d.filter((x) => x.status === "approved")))
      .catch(() => {});
  }, []);

  const loadPlaylists = async () => {
    setError(null);
    setResult(null);
    setPlaylists(null);
    setSelected(new Set());
    setBusy(true);
    try {
      const { playlists } = await getSeedPlaylists(profile);
      setPlaylists(playlists);
      if (playlists.length === 0) setError("No public playlists found for that profile.");
    } catch {
      setError("Couldn't read playlists — is the profile link correct and public?");
    } finally {
      setBusy(false);
    }
  };

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const togglePreview = async (id: string) => {
    setExpanded((cur) => (cur === id ? null : id));
    if (!previews[id]) {
      try {
        const { tracks } = await getSeedPlaylistTracks(id);
        setPreviews((p) => ({ ...p, [id]: tracks }));
      } catch {
        setPreviews((p) => ({ ...p, [id]: [] }));
      }
    }
  };

  const seed = async () => {
    if (!djId || !playlists || selected.size === 0) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      let total = 0;
      for (const pl of playlists.filter((p) => selected.has(p.playlistId))) {
        const tracks =
          previews[pl.playlistId] ?? (await getSeedPlaylistTracks(pl.playlistId)).tracks;
        if (tracks.length === 0) continue;
        const { seeded } = await seedCurated({ djUserId: djId, playlistName: pl.name, tracks });
        total += seeded;
      }
      setResult(`Seeded ${total} tracks into the catalog.`);
      setSelected(new Set());
    } catch {
      setError("Seeding failed — check the DJ and try again.");
    } finally {
      setBusy(false);
    }
  };

  const input =
    "rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-purple-500 focus:outline-none";

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-white">Seed catalog from Spotify playlists</h1>
        <p className="mt-1 text-sm text-slate-500">
          Reads a DJ's <strong>public</strong> playlists via the app token — no DJ login needed.
          Curated tracks are their <em>repertoire</em>, kept separate from what they played live.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-slate-400">
          Attribute to DJ
          <select
            value={djId}
            onChange={(e) => setDjId(e.target.value)}
            aria-label="DJ"
            className={input}
          >
            <option value="">Select a DJ…</option>
            {djs.map((d) => (
              <option key={d.id} value={d.id}>
                {d.displayName}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-1 flex-col gap-1 text-xs text-slate-400">
          Spotify profile link
          <input
            value={profile}
            onChange={(e) => setProfile(e.target.value)}
            placeholder="https://open.spotify.com/user/…"
            aria-label="Spotify profile link"
            className={input}
          />
        </label>
        <button
          type="button"
          disabled={busy || !profile.trim()}
          onClick={loadPlaylists}
          className="rounded-full bg-slate-800 px-4 py-2 text-sm font-medium disabled:opacity-40"
        >
          Load playlists
        </button>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-300"
        >
          {error}
        </div>
      )}
      {result && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
          {result}
        </div>
      )}

      {playlists && playlists.length > 0 && (
        <>
          <ul className="divide-y divide-white/5 rounded-2xl bg-slate-900">
            {playlists.map((pl) => (
              <li key={pl.playlistId} className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={selected.has(pl.playlistId)}
                    onChange={() => toggle(pl.playlistId)}
                    aria-label={`Select ${pl.name}`}
                    className="h-4 w-4 accent-purple-600"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm text-slate-100">{pl.name}</div>
                    <div className="text-xs text-slate-500">{pl.trackCount} tracks</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => togglePreview(pl.playlistId)}
                    className="text-xs text-slate-400 hover:text-slate-200"
                  >
                    {expanded === pl.playlistId ? "Hide" : "Preview"}
                  </button>
                </div>
                {expanded === pl.playlistId && (
                  <ul className="mt-2 max-h-48 overflow-y-auto pl-7 text-xs text-slate-400">
                    {previews[pl.playlistId] === undefined ? (
                      <li>Loading…</li>
                    ) : previews[pl.playlistId]?.length === 0 ? (
                      <li className="text-slate-600">No Spotify tracks (local files only).</li>
                    ) : (
                      previews[pl.playlistId]?.map((t) => (
                        <li key={t.spotifyId} className="truncate py-0.5">
                          {t.artists} – {t.name}
                        </li>
                      ))
                    )}
                  </ul>
                )}
              </li>
            ))}
          </ul>

          <button
            type="button"
            disabled={busy || !djId || selected.size === 0}
            onClick={seed}
            className="rounded-full bg-purple-600 px-6 py-2 text-sm font-semibold disabled:opacity-40"
          >
            {busy
              ? "Seeding…"
              : `Seed ${selected.size} playlist${selected.size === 1 ? "" : "s"} into catalog`}
          </button>
        </>
      )}
    </div>
  );
}
