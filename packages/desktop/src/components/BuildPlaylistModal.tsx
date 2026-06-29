/**
 * Build Spotify Playlist modal (B3) — the DJ-assist tool. For a past session, resolve each played
 * track to a Spotify recording (remembered match → recommended, else cloud search), let the DJ
 * accept/override/skip per row, then create the playlist on the shared Pika account. Confirmed
 * matches are written back to the local library (`dj_confirmed`) so they compound across nights.
 */

import { ExternalLink, ListMusic, Lock, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { trackRepository } from "../db/repositories/trackRepository";
import {
  createSpotifyPlaylist,
  PlaylistApiError,
  type SpotifyCandidate,
  searchSpotify,
} from "../services/spotifyPlaylist";

const isAuthError = (e: unknown): boolean =>
  e instanceof PlaylistApiError && (e.status === 401 || e.status === 403);

interface Props {
  session: { id: number; name: string | null };
  onClose: () => void;
}

type RowStatus = "searching" | "ready" | "unmatched" | "error";

interface Row {
  trackId: number;
  artist: string;
  title: string;
  durationMs?: number;
  status: RowStatus;
  candidates: SpotifyCandidate[];
  selectedIndex: number | null; // index into candidates, or null = skip
  locked: boolean; // dj_confirmed — already remembered
}

function fmtDuration(ms: number): string {
  if (!ms) return "";
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function BuildPlaylistModal({ session, onClose }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState(session.name ?? "Pika set");
  const [creating, setCreating] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [authError, setAuthError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const tracks = await trackRepository.getSessionTracksForMatching(session.id);
      const seeded: Row[] = tracks
        .filter((t): t is typeof t & { artist: string; title: string } => !!t.artist && !!t.title)
        .map((t) => {
          const durationMs = t.durationSec ? t.durationSec * 1000 : undefined;
          if (t.spotifyId) {
            // Remembered match — recommended, no search.
            const cand: SpotifyCandidate = {
              spotifyId: t.spotifyId,
              uri: `spotify:track:${t.spotifyId}`,
              url: t.spotifyUrl ?? `https://open.spotify.com/track/${t.spotifyId}`,
              name: t.title,
              artists: t.artist,
              durationMs: durationMs ?? 0,
              popularity: 0,
            };
            return {
              trackId: t.trackId,
              artist: t.artist,
              title: t.title,
              durationMs,
              status: "ready" as const,
              candidates: [cand],
              selectedIndex: 0,
              locked: t.spotifyMatchSource === "dj_confirmed",
            };
          }
          return {
            trackId: t.trackId,
            artist: t.artist,
            title: t.title,
            durationMs,
            status: "searching" as const,
            candidates: [],
            selectedIndex: null,
            locked: false,
          };
        });
      if (cancelled) return;
      setRows(seeded);
      setLoading(false);

      // Resolve the uncached rows sequentially (respects the cloud rate limit).
      for (let i = 0; i < seeded.length; i++) {
        if (seeded[i]?.status !== "searching") continue;
        const row = seeded[i];
        if (!row) continue;
        try {
          const r = await searchSpotify({
            artist: row.artist,
            title: row.title,
            ...(row.durationMs ? { durationMs: row.durationMs } : {}),
          });
          if (cancelled) return;
          setRows((prev) =>
            prev.map((p, idx) =>
              idx === i
                ? {
                    ...p,
                    status: r.candidates.length ? "ready" : "unmatched",
                    candidates: r.candidates,
                    selectedIndex: r.recommendedIndex,
                  }
                : p,
            ),
          );
        } catch (e) {
          if (cancelled) return;
          if (isAuthError(e)) {
            setAuthError(true);
            return; // stop searching — every call will fail the same way
          }
          setRows((prev) => prev.map((p, idx) => (idx === i ? { ...p, status: "error" } : p)));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session.id]);

  const selectedCount = rows.filter(
    (r) => r.selectedIndex !== null && r.candidates[r.selectedIndex],
  ).length;

  const setSelected = (rowIndex: number, value: number | null) =>
    setRows((prev) => prev.map((r, i) => (i === rowIndex ? { ...r, selectedIndex: value } : r)));

  const handleCreate = async () => {
    setCreating(true);
    setError(null);
    try {
      const chosen = rows
        .map((r) => (r.selectedIndex !== null ? r.candidates[r.selectedIndex] : null))
        .map((c, i) => ({ c, row: rows[i] }))
        .filter((x): x is { c: SpotifyCandidate; row: Row } => Boolean(x.c && x.row));

      const result = await createSpotifyPlaylist({
        name: name.trim() || "Pika set",
        tracks: chosen.map(({ c, row }) => ({
          artist: row.artist,
          title: row.title,
          spotifyId: c.spotifyId,
          uri: c.uri,
        })),
      });

      // Remember the confirmed matches locally (sticky) so next time they're instant.
      await Promise.allSettled(
        chosen.map(({ c, row }) =>
          trackRepository.setTrackSpotifyMatch(row.trackId, {
            spotifyId: c.spotifyId,
            spotifyUrl: c.url,
            confidence: null,
            source: "dj_confirmed",
          }),
        ),
      );
      setResultUrl(result.playlistUrl);
    } catch (e) {
      if (isAuthError(e)) setAuthError(true);
      else setError(e instanceof Error ? e.message : "Failed to create playlist");
    } finally {
      setCreating(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-3xl border border-slate-700/50 bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
          <div className="flex items-center gap-3 text-pika-accent">
            <ListMusic size={24} />
            <h3 className="text-xl font-bold text-white">Build Spotify Playlist</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-slate-400 hover:text-white"
          >
            <X size={22} />
          </button>
        </div>

        {resultUrl ? (
          <div className="flex flex-col items-center gap-4 px-6 py-12 text-center">
            <p className="text-lg font-semibold text-white">Playlist created 🎉</p>
            <a
              href={resultUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full bg-[#1DB954] px-6 py-2.5 font-semibold text-black"
            >
              <ExternalLink size={16} /> Open in Spotify
            </a>
            <button
              type="button"
              onClick={onClose}
              className="text-sm text-slate-400 hover:text-white"
            >
              Done
            </button>
          </div>
        ) : authError ? (
          <div className="px-6 py-10 text-center">
            <p className="mb-2 text-base font-semibold text-amber-300">This app isn't signed in</p>
            <p className="mx-auto max-w-sm text-sm text-slate-400">
              Building a playlist needs your DJ account. Open <strong>Settings</strong> and paste a
              fresh token from <strong>/dj/login</strong> on the web app (for the same server
              environment), then reopen this dialog.
            </p>
          </div>
        ) : (
          <>
            <div className="border-b border-slate-800 px-6 py-3">
              <label className="block text-xs font-medium uppercase tracking-wide text-slate-500">
                Playlist name
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value.slice(0, 100))}
                aria-label="Playlist name"
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-pika-accent focus:outline-none"
              />
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3">
              {loading ? (
                <p className="py-8 text-center text-sm text-slate-500">Loading set…</p>
              ) : rows.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-500">
                  No matchable tracks in this set.
                </p>
              ) : (
                <ul className="space-y-2">
                  {rows.map((row, i) => (
                    <li
                      key={row.trackId}
                      className="rounded-xl border border-slate-800 bg-slate-950/40 p-3"
                    >
                      <div className="mb-1.5 flex items-center gap-2">
                        <span className="truncate text-sm font-semibold text-slate-100">
                          {row.title}
                        </span>
                        <span className="truncate text-xs text-slate-500">{row.artist}</span>
                        {row.durationMs ? (
                          <span className="ml-auto shrink-0 text-[11px] text-slate-600">
                            {fmtDuration(row.durationMs)}
                          </span>
                        ) : null}
                      </div>

                      {row.status === "searching" ? (
                        <p className="text-xs text-slate-500">Searching Spotify…</p>
                      ) : row.status === "unmatched" ? (
                        <p className="text-xs text-amber-400/80">No Spotify match — skipped</p>
                      ) : row.status === "error" ? (
                        <p className="text-xs text-red-400/80">Search failed — skipped</p>
                      ) : (
                        <div className="flex items-center gap-2">
                          {row.locked && (
                            <Lock
                              size={13}
                              className="shrink-0 text-emerald-400"
                              aria-label="Remembered match"
                            />
                          )}
                          <select
                            aria-label={`Spotify match for ${row.title}`}
                            value={row.selectedIndex ?? -1}
                            onChange={(e) => {
                              const v = Number(e.target.value);
                              setSelected(i, v < 0 ? null : v);
                            }}
                            className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-200"
                          >
                            {row.candidates.map((c, ci) => (
                              <option key={c.spotifyId} value={ci}>
                                {c.name} — {c.artists} ({fmtDuration(c.durationMs)})
                              </option>
                            ))}
                            <option value={-1}>Skip this track</option>
                          </select>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {error && (
              <div role="alert" className="px-6 py-2 text-sm text-red-300">
                {error}
              </div>
            )}

            <div className="flex items-center justify-between gap-3 border-t border-slate-800 px-6 py-4">
              <span className="text-xs text-slate-500">{selectedCount} tracks selected</span>
              <button
                type="button"
                disabled={creating || selectedCount === 0}
                onClick={handleCreate}
                className="rounded-full bg-pika-accent px-6 py-2 text-sm font-semibold text-slate-950 disabled:opacity-40"
              >
                {creating ? "Creating…" : "Create playlist"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
