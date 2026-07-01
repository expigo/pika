/**
 * Slice 3 — verify / change / remove a single track's Spotify match from the LibraryBrowser inspector.
 * Reuses the exported search/resolve services + the `dj_confirmed` write; a confirm is also promoted
 * best-effort to the shared cloud cache (`/api/playlist/confirm`) so the correction helps every DJ.
 * Self-contained (mirrors BuildPlaylistModal's patterns without refactoring it).
 */

import { openUrl } from "@tauri-apps/plugin-opener";
import { Check, Disc3, ExternalLink, Loader2, Lock, Search, X } from "lucide-react";
import { useCallback, useState } from "react";
import { type Track, trackRepository } from "../db/repositories/trackRepository";
import {
  confirmSpotifyMatch,
  PlaylistApiError,
  parseSpotifyTrackId,
  resolveSpotifyTrack,
  type SpotifyCandidate,
  searchSpotify,
} from "../services/spotifyPlaylist";

interface Props {
  track: Track;
  /** Called with the re-fetched track after a confirm/remove so the list + inspector refresh. */
  onChanged: (updated: Track) => void;
}

const isAuthError = (e: unknown): boolean =>
  e instanceof PlaylistApiError && (e.status === 401 || e.status === 403);

function fmtDuration(ms?: number): string {
  if (!ms) return "—";
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Stored match → a display label. `dj_confirmed` shows a lock; `auto` buckets the numeric confidence. */
function matchLabel(
  source: string | null,
  confidence: number | null,
): { text: string; cls: string; locked: boolean } {
  if (source === "dj_confirmed")
    return { text: "Confirmed", cls: "text-emerald-400", locked: true };
  const n = confidence ?? 0;
  if (n >= 0.8) return { text: "Strong match", cls: "text-emerald-400", locked: false };
  if (n >= 0.55) return { text: "Likely — verify", cls: "text-amber-400", locked: false };
  if (n > 0) return { text: "Uncertain — check", cls: "text-orange-400", locked: false };
  return { text: "Matched", cls: "text-slate-400", locked: false };
}

function Art({ url, size = 44 }: { url?: string | null; size?: number }) {
  if (!url) {
    return (
      <div
        className="flex shrink-0 items-center justify-center rounded bg-slate-800"
        style={{ width: size, height: size }}
      >
        <Disc3 size={size * 0.36} className="text-slate-600" />
      </div>
    );
  }
  return (
    <img
      src={url}
      alt=""
      className="shrink-0 rounded object-cover"
      style={{ width: size, height: size }}
    />
  );
}

const openExternal = (url: string) => void openUrl(url).catch(() => {});

export function SpotifyMatchManager({ track, onChanged }: Props) {
  const [editing, setEditing] = useState(false);
  const [candidates, setCandidates] = useState<SpotifyCandidate[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paste, setPaste] = useState("");

  const artist = track.artist ?? "";
  const title = track.title ?? "";
  const canSearch = artist.length > 0 && title.length > 0;

  const runSearch = useCallback(async () => {
    if (!canSearch) {
      setError("This track has no artist/title to search.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const ms = track.duration && track.duration > 0 ? Math.round(track.duration * 1000) : 0;
      const r = await searchSpotify({
        artist,
        title,
        ...(ms > 0 && ms <= 3_600_000 ? { durationMs: ms } : {}),
      });
      setCandidates(r.candidates);
      if (r.candidates.length === 0) setError("No Spotify match found — paste a link below.");
    } catch (e) {
      setError(
        isAuthError(e) ? "Reconnect your Pika account to search." : "Spotify search failed.",
      );
    } finally {
      setBusy(false);
    }
  }, [artist, title, track.duration, canSearch]);

  const openEditor = useCallback(() => {
    setEditing(true);
    setCandidates([]);
    setError(null);
    setPaste("");
    void runSearch();
  }, [runSearch]);

  const resolvePasted = useCallback(async () => {
    const id = parseSpotifyTrackId(paste);
    if (!id) {
      setError("That doesn't look like a Spotify track link.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { candidate } = await resolveSpotifyTrack(id);
      setCandidates((prev) => [
        candidate,
        ...prev.filter((c) => c.spotifyId !== candidate.spotifyId),
      ]);
      setPaste("");
    } catch (e) {
      setError(isAuthError(e) ? "Reconnect your Pika account." : "Couldn't resolve that link.");
    } finally {
      setBusy(false);
    }
  }, [paste]);

  const confirm = useCallback(
    async (c: SpotifyCandidate) => {
      setBusy(true);
      setError(null);
      try {
        await trackRepository.setTrackSpotifyMatch(track.id, {
          spotifyId: c.spotifyId,
          spotifyUrl: c.url,
          albumArtUrl: c.albumArtUrl ?? null,
          confidence: null,
          source: "dj_confirmed",
        });
        // Best-effort: promote the correction to the shared cache (local write is authoritative).
        void confirmSpotifyMatch({
          artist,
          title,
          spotifyId: c.spotifyId,
          spotifyUrl: c.url,
        }).catch(() => {});
        const updated = await trackRepository.getTrackById(track.id);
        if (updated) onChanged(updated);
        setEditing(false);
      } catch {
        setError("Couldn't save the match.");
      } finally {
        setBusy(false);
      }
    },
    [track.id, artist, title, onChanged],
  );

  const remove = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await trackRepository.clearTrackSpotifyMatch(track.id);
      const updated = await trackRepository.getTrackById(track.id);
      if (updated) onChanged(updated);
      setEditing(false);
    } catch {
      setError("Couldn't remove the match.");
    } finally {
      setBusy(false);
    }
  }, [track.id, onChanged]);

  const lbl = matchLabel(track.spotifyMatchSource, track.spotifyMatchConfidence);

  return (
    <div
      className="rounded-xl border border-slate-800 bg-slate-950/40 p-4"
      data-testid="match-manager"
    >
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
          Spotify match
        </h4>
        {track.spotifyId && !editing && (
          <span className={`flex items-center gap-1 text-[10px] font-bold ${lbl.cls}`}>
            {lbl.locked && <Lock size={10} />}
            {lbl.text}
          </span>
        )}
      </div>

      {/* Current match (view mode) */}
      {track.spotifyId && !editing && (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <Art url={track.spotifyAlbumArtUrl} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-slate-200">
                {title || "Untitled"}
              </div>
              <div className="truncate text-xs text-slate-500">{artist || "Unknown"}</div>
            </div>
            {track.spotifyUrl && (
              <button
                type="button"
                onClick={() => openExternal(track.spotifyUrl as string)}
                className="text-slate-400 hover:text-emerald-400"
                aria-label="Open in Spotify"
              >
                <ExternalLink size={16} />
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={openEditor}
              className="flex-1 rounded-lg border border-slate-700 py-1.5 text-xs font-bold text-slate-300 hover:border-slate-600"
            >
              Change
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={remove}
              className="rounded-lg border border-red-600/30 bg-red-600/10 px-3 py-1.5 text-xs font-bold text-red-400 hover:bg-red-600/20 disabled:opacity-40"
            >
              Remove
            </button>
          </div>
        </div>
      )}

      {/* Not matched (view mode) */}
      {!track.spotifyId && !editing && (
        <div className="space-y-2">
          <p className="text-xs text-slate-500">Not matched to Spotify.</p>
          <button
            type="button"
            onClick={openEditor}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-pika-accent py-2 text-xs font-bold text-white hover:bg-pika-accent-light"
          >
            <Search size={14} />
            Match to Spotify
          </button>
        </div>
      )}

      {/* Editor (search + candidates + paste) */}
      {editing && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">
              {busy ? "Searching…" : "Pick the right recording:"}
            </span>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="text-slate-500 hover:text-slate-300"
              aria-label="Cancel"
            >
              <X size={14} />
            </button>
          </div>

          {busy && candidates.length === 0 && (
            <div className="flex justify-center py-3">
              <Loader2 size={18} className="animate-spin text-slate-600" />
            </div>
          )}

          <ul className="space-y-1.5">
            {candidates.map((c) => (
              <li key={c.spotifyId}>
                <div className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/40 p-2">
                  <Art url={c.albumArtUrl} size={36} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-medium text-slate-200">{c.name}</div>
                    <div className="truncate text-[10px] text-slate-500">
                      {c.artists} · {fmtDuration(c.durationMs)}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => openExternal(c.url)}
                    className="text-slate-500 hover:text-emerald-400"
                    aria-label="Preview in Spotify"
                  >
                    <ExternalLink size={13} />
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => confirm(c)}
                    className="flex items-center gap-1 rounded-md bg-emerald-600 px-2 py-1 text-[10px] font-bold text-white hover:bg-emerald-500 disabled:opacity-40"
                  >
                    <Check size={11} />
                    Use
                  </button>
                </div>
              </li>
            ))}
          </ul>

          <div className="flex gap-2">
            <input
              type="text"
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
              placeholder="Paste a Spotify track link…"
              aria-label="Spotify track link"
              className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-200 placeholder:text-slate-600 focus:border-pika-accent focus:outline-none"
            />
            <button
              type="button"
              disabled={busy || paste.trim().length === 0}
              onClick={resolvePasted}
              className="rounded-lg border border-slate-700 px-3 text-xs font-bold text-slate-300 hover:border-slate-600 disabled:opacity-40"
            >
              Resolve
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="mt-3 rounded border border-red-500/20 bg-red-500/10 p-2 text-[10px] italic text-red-400">
          {error}
        </div>
      )}
    </div>
  );
}
