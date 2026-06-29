"use client";

/**
 * Songs browser (B3 catalog) — every stored Spotify track, searchable/sortable, with all canonical
 * features and a per-song detail showing which DJs/playlists it appears in. The detail keeps the
 * Spotify catalog and the Pika catalog as separate, labeled sections (never merged).
 */

import { useEffect, useState } from "react";
import {
  type CatalogSong,
  type CatalogSongDetail,
  getCatalogSong,
  getCatalogSongs,
} from "@/lib/admin";

const PITCH = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
const PAGE = 25;

function keyLabel(keyPitch: number | null, mode: number | null): string {
  if (keyPitch == null || keyPitch < 0) return "—";
  return `${PITCH[keyPitch] ?? keyPitch}${mode === 0 ? "m" : ""}`;
}
const f2 = (v: number | null) => (v == null ? "—" : v.toFixed(2));
const f0 = (v: number | null) => (v == null ? "—" : Math.round(v));

function FeatureGrid({ s }: { s: NonNullable<CatalogSongDetail["spotify"]> }) {
  const num = (k: string): number | null => {
    const v = s[k as keyof typeof s];
    return typeof v === "number" ? v : null;
  };
  const rows: Array<[string, string]> = [
    ["Tempo", num("tempo") == null ? "—" : `${Math.round(num("tempo") as number)} BPM`],
    ["Key", keyLabel(num("keyPitch"), num("mode"))],
    ["Energy", f2(num("energy"))],
    ["Danceability", f2(num("danceability"))],
    ["Valence", f2(num("valence"))],
    ["Acousticness", f2(num("acousticness"))],
    ["Instrumentalness", f2(num("instrumentalness"))],
    ["Liveness", f2(num("liveness"))],
    ["Speechiness", f2(num("speechiness"))],
    ["Loudness", num("loudness") == null ? "—" : `${f2(num("loudness"))} dB`],
    ["Time sig", num("timeSignature") == null ? "—" : `${num("timeSignature")}/4`],
    ["Popularity", String(f0(num("popularity")))],
  ];
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-2">
          <span className="text-slate-500">{k}</span>
          <span className="text-slate-200">{v}</span>
        </div>
      ))}
    </div>
  );
}

function Detail({ id, onClose }: { id: string; onClose: () => void }) {
  const [d, setD] = useState<CatalogSongDetail | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    setD(null);
    setError(false);
    getCatalogSong(id)
      .then(setD)
      .catch(() => setError(true));
  }, [id]);

  return (
    <div className="rounded-2xl border border-purple-500/20 bg-slate-900 p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-white">{d ? d.name : "Loading…"}</div>
          <div className="truncate text-xs text-slate-400">{d?.artists}</div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-slate-400 hover:text-slate-200"
        >
          Close
        </button>
      </div>

      {error && <div className="text-sm text-amber-300">Couldn't load that song.</div>}
      {d && (
        <div className="space-y-4">
          <div>
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-emerald-400">
              Spotify features
            </div>
            {d.spotify ? (
              <FeatureGrid s={d.spotify} />
            ) : (
              <div className="text-xs text-slate-600">No Spotify features stored.</div>
            )}
          </div>

          <div>
            <div className="mb-1 flex items-baseline justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-sky-400">
                Pika features
              </span>
              {d.pika && (
                <span className="text-[10px] text-slate-500">
                  consensus · {d.pika.plays} play{d.pika.plays === 1 ? "" : "s"} · {d.pika.djs} DJ
                  {d.pika.djs === 1 ? "" : "s"}
                </span>
              )}
            </div>
            {d.pika ? (
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
                {(
                  [
                    ["BPM", d.pika.bpm],
                    ["Energy", d.pika.energy],
                    ["Danceability", d.pika.danceability],
                    ["Brightness", d.pika.brightness],
                    ["Acousticness", d.pika.acousticness],
                    ["Groove", d.pika.groove],
                  ] as const
                ).map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-2">
                    <span className="text-slate-500">{k}</span>
                    <span className="text-slate-200">{v == null ? "—" : v}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-slate-600">
                Pika's own analysis (0–100) — appears once this track has been played in a live
                session. Kept separate from Spotify's, never merged.
              </div>
            )}
          </div>

          <div>
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Appears in ({d.appearances.length})
            </div>
            <ul className="max-h-40 space-y-0.5 overflow-y-auto text-sm">
              {d.appearances.map((a) => (
                <li key={`${a.djName}-${a.playlistName}`} className="flex items-baseline gap-2">
                  <span className="shrink-0 rounded bg-purple-600/20 px-1.5 text-xs text-purple-300">
                    {a.djName}
                  </span>
                  <span className="truncate text-slate-300">{a.playlistName}</span>
                </li>
              ))}
            </ul>
          </div>
          <a
            href={`https://open.spotify.com/track/${d.spotifyId}`}
            target="_blank"
            rel="noreferrer"
            className="inline-block text-xs text-emerald-400 hover:underline"
          >
            Open on Spotify ↗
          </a>
        </div>
      )}
    </div>
  );
}

export function SongsBrowser() {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("popularity");
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<{ total: number; songs: CatalogSong[] } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  // Debounced search; reset to first page when the query/sort changes.
  useEffect(() => {
    const t = setTimeout(() => {
      getCatalogSongs({ q, sort, limit: PAGE, offset })
        .then(setData)
        .catch(() => setData({ total: 0, songs: [] }));
    }, 250);
    return () => clearTimeout(t);
  }, [q, sort, offset]);

  const input =
    "rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-purple-500 focus:outline-none";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-sm font-medium text-slate-200">All songs</h2>
        <input
          value={q}
          onChange={(e) => {
            setOffset(0);
            setQ(e.target.value);
          }}
          placeholder="Search artist or title…"
          aria-label="Search songs"
          className={`${input} flex-1`}
        />
        <select
          value={sort}
          onChange={(e) => {
            setOffset(0);
            setSort(e.target.value);
          }}
          aria-label="Sort"
          className={input}
        >
          <option value="popularity">Popularity</option>
          <option value="tempo">Tempo</option>
          <option value="energy">Energy</option>
          <option value="djs">DJ count</option>
          <option value="name">Name</option>
        </select>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="overflow-x-auto rounded-2xl bg-slate-900">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-slate-500">
              <tr className="border-b border-white/5">
                <th className="px-3 py-2 font-medium">Track</th>
                <th className="px-2 py-2 text-right font-medium">DJs</th>
                <th className="px-2 py-2 text-right font-medium">Lists</th>
                <th className="px-2 py-2 text-right font-medium">BPM</th>
                <th className="px-2 py-2 text-right font-medium">Key</th>
                <th className="px-2 py-2 text-right font-medium">Energy</th>
                <th className="px-2 py-2 text-right font-medium">Pop</th>
              </tr>
            </thead>
            <tbody>
              {data?.songs.map((s) => (
                <tr
                  key={s.spotifyId}
                  onClick={() => setSelected(s.spotifyId)}
                  className={`cursor-pointer border-b border-white/5 hover:bg-white/5 ${selected === s.spotifyId ? "bg-purple-600/10" : ""}`}
                >
                  <td className="max-w-0 px-3 py-2">
                    <div className="truncate text-slate-200">{s.name}</div>
                    <div className="truncate text-xs text-slate-500">{s.artists}</div>
                  </td>
                  <td className="px-2 py-2 text-right text-slate-400">{s.djCount}</td>
                  <td className="px-2 py-2 text-right text-slate-400">{s.playlistCount}</td>
                  <td className="px-2 py-2 text-right text-slate-400">{f0(s.tempo)}</td>
                  <td className="px-2 py-2 text-right text-slate-400">
                    {keyLabel(s.keyPitch, s.mode)}
                  </td>
                  <td className="px-2 py-2 text-right text-slate-400">{f2(s.energy)}</td>
                  <td className="px-2 py-2 text-right text-slate-400">{f0(s.popularity)}</td>
                </tr>
              ))}
              {data && data.songs.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-sm text-slate-600">
                    No songs match.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {data && data.total > PAGE && (
            <div className="flex items-center justify-between px-3 py-2 text-xs text-slate-500">
              <button
                type="button"
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - PAGE))}
                className="disabled:opacity-30"
              >
                ← Prev
              </button>
              <span>
                {offset + 1}–{Math.min(offset + PAGE, data.total)} of {data.total}
              </span>
              <button
                type="button"
                disabled={offset + PAGE >= data.total}
                onClick={() => setOffset(offset + PAGE)}
                className="disabled:opacity-30"
              >
                Next →
              </button>
            </div>
          )}
        </div>

        {selected && <Detail id={selected} onClose={() => setSelected(null)} />}
      </div>
    </div>
  );
}
