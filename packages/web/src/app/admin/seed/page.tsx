"use client";

/**
 * Catalog seed tool (B3, admin). Owner-driven: pick a cooperating DJ, then seed their repertoire
 * (`curated_tracks` + `track_links`) into the catalog via one of two modes:
 *  - From profile: paste a Spotify profile link, preview their PUBLIC playlists, curate (read via
 *    the service account — DORMANT while Spotify blocks new apps from reading playlists, kept ready
 *    for a grandfathered account).
 *  - Import CSV: upload an Exportify or Chosic export (auto-detected), which also carries Spotify's
 *    canonical audio features. Both formats of the same track are merged accretively cloud-side.
 * Curated tracks are a DJ's *repertoire*, kept separate from what they played live.
 */

import { parseChosicCsv, parseExportifyCsv } from "@pika/shared";
import { useEffect, useState } from "react";
import {
  AdminApiError,
  type AdminDj,
  getDjs,
  getSeedPlaylists,
  getSeedPlaylistTracks,
  type SeedPlaylist,
  type SeedTrack,
  seedCurated,
} from "@/lib/admin";

type Mode = "profile" | "csv";
type CsvFormat = "exportify" | "chosic";
type CsvFile = {
  name: string;
  playlistName: string;
  tracks: SeedTrack[];
  skippedLocal: number;
  featuresSource: CsvFormat;
};

const DJ_KEY = "pika_admin_seed_dj";
/** Exportify names the file after the playlist (spaces→underscores) — de-munge as the default name. */
function defaultPlaylistName(fileName: string): string {
  return fileName
    .replace(/\.csv$/i, "")
    .replace(/_/g, " ")
    .trim();
}
/** Sniff the CSV tool by its header so either export imports without a manual toggle. */
function detectCsvFormat(text: string): CsvFormat | null {
  const header = (text.split(/\r?\n/, 1)[0] ?? "").toLowerCase();
  if (header.includes("track uri")) return "exportify";
  if (header.includes("spotify track id") || header.includes("camelot")) return "chosic";
  return null;
}

export default function AdminSeedPage() {
  const [djs, setDjs] = useState<AdminDj[]>([]);
  const [djId, setDjId] = useState("");
  const [mode, setMode] = useState<Mode>("profile");
  // Profile mode
  const [profile, setProfile] = useState("");
  const [playlists, setPlaylists] = useState<SeedPlaylist[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [previews, setPreviews] = useState<Record<string, SeedTrack[]>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  // CSV mode — multiple files, each seeded as its own (editable-name) playlist.
  const [csvFiles, setCsvFiles] = useState<CsvFile[]>([]);
  const [progress, setProgress] = useState<{ done: number; total: number; current: string } | null>(
    null,
  );
  // Shared
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    getDjs()
      .then((d) => setDjs(d.filter((x) => x.status === "approved")))
      .catch(() => {});
  }, []);

  // Restore the selected DJ — admin tabs remount this page (and a SW nav can hard-reload), so the
  // choice is persisted in localStorage rather than lost on every tab switch.
  useEffect(() => {
    const saved = localStorage.getItem(DJ_KEY);
    if (saved) setDjId(saved);
  }, []);
  const chooseDj = (id: string) => {
    setDjId(id);
    if (id) localStorage.setItem(DJ_KEY, id);
    else localStorage.removeItem(DJ_KEY);
  };

  const switchMode = (m: Mode) => {
    setMode(m);
    setError(null);
    setResult(null);
  };

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
    } catch (e) {
      // Surface the server's reason — esp. "connect the playlist service account (with read access)".
      setError(
        e instanceof AdminApiError
          ? e.message
          : "Couldn't read playlists — is the profile link correct and public?",
      );
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

  const seedProfile = async () => {
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

  const onCsvFiles = async (files: FileList | null) => {
    setError(null);
    setResult(null);
    setCsvFiles([]);
    if (!files || files.length === 0) return;
    try {
      const parsed: CsvFile[] = [];
      for (const file of Array.from(files)) {
        const text = await file.text();
        const fmt = detectCsvFormat(text);
        if (!fmt) continue; // unrecognized header — skip (reported below if nothing parsed)
        const { tracks, skippedLocal } =
          fmt === "chosic" ? parseChosicCsv(text) : parseExportifyCsv(text);
        parsed.push({
          name: file.name,
          playlistName: defaultPlaylistName(file.name),
          tracks,
          skippedLocal,
          featuresSource: fmt,
        });
      }
      setCsvFiles(parsed);
      if (parsed.length === 0 || parsed.every((f) => f.tracks.length === 0))
        setError("No Spotify tracks found — are they Exportify or Chosic exports?");
    } catch {
      setError("Couldn't read those CSVs — are they Exportify or Chosic exports?");
    }
  };

  const setPlaylistName = (idx: number, name: string) =>
    setCsvFiles((fs) => fs.map((f, i) => (i === idx ? { ...f, playlistName: name } : f)));

  const csvTrackTotal = csvFiles.reduce((n, f) => n + f.tracks.length, 0);

  const seedCsv = async () => {
    const files = csvFiles.filter((f) => f.tracks.length > 0);
    if (!djId || files.length === 0) return;
    setBusy(true);
    setError(null);
    setResult(null);
    setProgress({ done: 0, total: files.length, current: "" });
    try {
      let total = 0;
      // One request per file (the cloud batch-upserts the whole playlist); shows per-file progress.
      for (const [i, f] of files.entries()) {
        const playlistName = f.playlistName.trim() || defaultPlaylistName(f.name);
        setProgress({ done: i, total: files.length, current: playlistName });
        const { seeded } = await seedCurated({
          djUserId: djId,
          playlistName,
          tracks: f.tracks,
          featuresSource: f.featuresSource,
        });
        total += seeded;
      }
      setResult(
        `Seeded ${total} tracks across ${files.length} playlist${files.length === 1 ? "" : "s"}.`,
      );
      setCsvFiles([]);
    } catch (e) {
      setError(
        e instanceof AdminApiError ? e.message : "Seeding failed — check the DJ and try again.",
      );
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const input =
    "rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-purple-500 focus:outline-none";
  const tab = (active: boolean) =>
    `rounded-full px-4 py-1.5 text-sm font-medium ${active ? "bg-purple-600 text-white" : "bg-slate-800 text-slate-300"}`;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-white">Seed catalog from Spotify</h1>
        <p className="mt-1 text-sm text-slate-500">
          Curated tracks are a DJ's <em>repertoire</em>, kept separate from what they played live.
        </p>
      </div>

      <label className="flex max-w-xs flex-col gap-1 text-xs text-slate-400">
        Attribute to DJ
        <select
          value={djId}
          onChange={(e) => chooseDj(e.target.value)}
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

      <div className="flex gap-2" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "profile"}
          onClick={() => switchMode("profile")}
          className={tab(mode === "profile")}
        >
          From profile
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "csv"}
          onClick={() => switchMode("csv")}
          className={tab(mode === "csv")}
        >
          Import CSV
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

      {mode === "profile" && (
        <>
          <p className="text-sm text-slate-500">
            Reads a DJ's <strong>public</strong> playlists via the service account — no DJ login
            needed.
          </p>
          <div className="flex flex-wrap items-end gap-3">
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
                onClick={seedProfile}
                className="rounded-full bg-purple-600 px-6 py-2 text-sm font-semibold disabled:opacity-40"
              >
                {busy
                  ? "Seeding…"
                  : `Seed ${selected.size} playlist${selected.size === 1 ? "" : "s"} into catalog`}
              </button>
            </>
          )}
        </>
      )}

      {mode === "csv" && (
        <>
          <p className="text-sm text-slate-500">
            Export playlists with{" "}
            <a
              href="https://exportify.net"
              target="_blank"
              rel="noreferrer"
              className="text-purple-400 hover:underline"
            >
              Exportify
            </a>{" "}
            (or Chosic) and upload one or more CSVs — each becomes a playlist (name editable below).
            Imports identity <em>and</em> Spotify's own audio features (tempo/key/energy/…);
            Exportify + Chosic exports of the same track are merged (best of both). Format is
            auto-detected.
          </p>
          <label className="flex flex-col gap-1 text-xs text-slate-400">
            Exportify / Chosic CSV(s) — select multiple
            <input
              type="file"
              accept=".csv,text/csv"
              multiple
              aria-label="Playlist CSVs"
              onChange={(e) => onCsvFiles(e.target.files)}
              className="text-sm text-slate-300 file:mr-3 file:rounded-full file:border-0 file:bg-slate-800 file:px-4 file:py-2 file:text-sm file:font-medium file:text-slate-200"
            />
          </label>

          {csvFiles.length > 0 && (
            <>
              <ul className="space-y-2">
                {csvFiles.map((f, idx) => (
                  <li key={f.name} className="rounded-2xl bg-slate-900 px-4 py-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <input
                        value={f.playlistName}
                        onChange={(e) => setPlaylistName(idx, e.target.value)}
                        aria-label={`Playlist name for ${f.name}`}
                        placeholder="Playlist name"
                        className={`${input} flex-1`}
                      />
                      <span className="shrink-0 text-xs text-slate-500">
                        {f.tracks.length} tracks
                        {f.skippedLocal > 0 && <> · {f.skippedLocal} local skipped</>}
                      </span>
                    </div>
                    <div className="mt-1 truncate text-[11px] text-slate-600">{f.name}</div>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                disabled={busy || !djId || csvTrackTotal === 0}
                onClick={seedCsv}
                className="rounded-full bg-purple-600 px-6 py-2 text-sm font-semibold disabled:opacity-40"
              >
                {busy
                  ? progress
                    ? `Seeding ${Math.min(progress.done + 1, progress.total)}/${progress.total}: ${progress.current}…`
                    : "Seeding…"
                  : `Seed ${csvTrackTotal} tracks · ${csvFiles.length} playlist${csvFiles.length === 1 ? "" : "s"}`}
              </button>
            </>
          )}
        </>
      )}
    </div>
  );
}
