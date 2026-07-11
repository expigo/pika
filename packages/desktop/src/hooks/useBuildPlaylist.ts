/**
 * State + async flows behind the Build Spotify Playlist modal (B3). Owns the whole pipeline:
 * remembered-playlist short-circuit → seed rows from the set (remembered match → recommended,
 * else serial cloud search with art backfill), the DJ's manual overrides (choose / paste link /
 * re-match), playlist creation with `dj_confirmed` write-backs, and the share-to-profile sync.
 * The modal is rendering-only; every side effect and error path (incl. the 401/403 auth gate,
 * which any of the flows can trip) lives here.
 */

import { type Dispatch, type SetStateAction, useEffect, useState } from "react";
import { sessionRepository } from "../db/repositories/sessionRepository";
import { trackRepository } from "../db/repositories/trackRepository";
import { syncSessionPlaylist, unsyncSessionPlaylist } from "../services/djApi";
import {
  createSpotifyPlaylist,
  type MatchResult,
  PlaylistApiError,
  parseSpotifyTrackId,
  resolveSpotifyTrack,
  resolveSpotifyTracks,
  type SpotifyCandidate,
  searchSpotify,
} from "../services/spotifyPlaylist";

export type RowStatus = "searching" | "ready" | "unmatched" | "error";
export type Confidence = MatchResult["confidence"];

export interface Row {
  trackId: number;
  artist: string;
  title: string;
  durationMs?: number;
  status: RowStatus;
  candidates: SpotifyCandidate[];
  selectedIndex: number | null; // index into candidates, or null = skip
  confidence: Confidence;
  locked: boolean; // dj_confirmed — already remembered
  fromCache: boolean; // seeded from the remembered match (single candidate, no art/alternatives)
}

const isAuthError = (e: unknown): boolean =>
  e instanceof PlaylistApiError && (e.status === 401 || e.status === 403);

export interface UseBuildPlaylistState {
  rows: Row[];
  loading: boolean;
  name: string;
  note: string;
  creating: boolean;
  resultUrl: string | null;
  /** What the "done" screen shows: a fresh create wins; else the remembered one (unless rebuilding). */
  doneUrl: string | null;
  error: string | null;
  authError: boolean;
  expandedRow: number | null;
  syncState: {
    cloudSessionId: string | null;
    playlistId: string | null;
    url: string | null;
    syncedAt: number | null;
  } | null;
  syncing: boolean;
  syncError: string | null;
  selectedCount: number;
}

export interface UseBuildPlaylistReturn extends UseBuildPlaylistState {
  setName: (value: string) => void;
  setNote: (value: string) => void;
  setExpandedRow: Dispatch<SetStateAction<number | null>>;
  choose: (rowIndex: number, value: number | null) => void;
  pasteLink: (rowIndex: number, input: string) => Promise<string | null>;
  rematch: (rowIndex: number) => Promise<void>;
  handleCreate: () => Promise<void>;
  handleSync: () => Promise<void>;
  handleUnsync: () => Promise<void>;
  startRebuild: () => void;
}

export function useBuildPlaylist(session: {
  id: number;
  name: string | null;
}): UseBuildPlaylistReturn {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState(session.name ?? "Pika set");
  const [note, setNote] = useState("");
  const [creating, setCreating] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [existingUrl, setExistingUrl] = useState<string | null>(null);
  const [rebuild, setRebuild] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authError, setAuthError] = useState(false);
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  // Playlist-sync (share this set's playlist on the DJ's public profile) state, loaded on the done screen.
  const [syncState, setSyncState] = useState<{
    cloudSessionId: string | null;
    playlistId: string | null;
    url: string | null;
    syncedAt: number | null;
  } | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  // What to show on the "done" screen: a fresh create wins; else the remembered one (unless rebuilding).
  const doneUrl = resultUrl ?? (rebuild ? null : existingUrl);

  // On the done screen, load everything the "share to profile" affordance needs.
  useEffect(() => {
    if (!doneUrl) return;
    let cancelled = false;
    sessionRepository.getSessionPlaylistState(session.id).then((s) => {
      if (!cancelled) setSyncState(s);
    });
    return () => {
      cancelled = true;
    };
  }, [doneUrl, session.id]);

  const handleSync = async () => {
    if (!syncState?.cloudSessionId || !syncState.playlistId) return;
    setSyncing(true);
    setSyncError(null);
    try {
      await syncSessionPlaylist(syncState.cloudSessionId, {
        spotifyPlaylistId: syncState.playlistId,
        ...(syncState.url ? { spotifyPlaylistUrl: syncState.url } : {}),
      });
      const ts = Math.floor(Date.now() / 1000);
      await sessionRepository.setSessionPlaylistSynced(session.id, ts);
      setSyncState((s) => (s ? { ...s, syncedAt: ts } : s));
    } catch (e) {
      if (isAuthError(e)) setAuthError(true);
      else setSyncError(e instanceof Error ? e.message : "Couldn't share to your profile");
    } finally {
      setSyncing(false);
    }
  };

  const handleUnsync = async () => {
    if (!syncState?.cloudSessionId) return;
    setSyncing(true);
    setSyncError(null);
    try {
      await unsyncSessionPlaylist(syncState.cloudSessionId);
      await sessionRepository.setSessionPlaylistSynced(session.id, null);
      setSyncState((s) => (s ? { ...s, syncedAt: null } : s));
    } catch (e) {
      if (isAuthError(e)) setAuthError(true);
      else setSyncError(e instanceof Error ? e.message : "Couldn't update your profile");
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Remembered playlist for this set → short-circuit (no wasted search/create) unless rebuilding.
      if (!rebuild) {
        const prev = await sessionRepository.getSessionPlaylistUrl(session.id);
        if (prev) {
          if (!cancelled) {
            setExistingUrl(prev);
            setLoading(false);
          }
          return;
        }
      }

      setLoading(true);
      const tracks = await trackRepository.getSessionTracksForMatching(session.id);
      const seeded: Row[] = tracks
        .filter((t): t is typeof t & { artist: string; title: string } => !!t.artist && !!t.title)
        .map((t) => {
          const durationMs = t.durationSec ? t.durationSec * 1000 : undefined;
          if (t.spotifyId) {
            const cand: SpotifyCandidate = {
              spotifyId: t.spotifyId,
              uri: `spotify:track:${t.spotifyId}`,
              url: t.spotifyUrl ?? `https://open.spotify.com/track/${t.spotifyId}`,
              name: t.title,
              artists: t.artist,
              durationMs: durationMs ?? 0,
              popularity: 0,
              ...(t.spotifyAlbumArtUrl ? { albumArtUrl: t.spotifyAlbumArtUrl } : {}),
            };
            return {
              trackId: t.trackId,
              artist: t.artist,
              title: t.title,
              durationMs,
              status: "ready" as const,
              candidates: [cand],
              selectedIndex: 0,
              confidence: "high" as const,
              locked: t.spotifyMatchSource === "dj_confirmed",
              fromCache: true,
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
            confidence: "none" as const,
            locked: false,
            fromCache: false,
          };
        });
      if (cancelled) return;
      setRows(seeded);
      setLoading(false);

      // Backfill album art for remembered matches saved before art was stored (older confirmations).
      const needArt = seeded
        .filter((r) => r.fromCache && r.candidates[0]?.spotifyId && !r.candidates[0]?.albumArtUrl)
        .map((r) => ({ trackId: r.trackId, spotifyId: r.candidates[0]?.spotifyId as string }));
      if (needArt.length > 0) {
        try {
          const { candidates } = await resolveSpotifyTracks(needArt.map((n) => n.spotifyId));
          if (cancelled) return;
          const artById = new Map(
            candidates
              .filter((c) => c.albumArtUrl)
              .map((c) => [c.spotifyId, c.albumArtUrl as string]),
          );
          setRows((prev) =>
            prev.map((r) => {
              const c0 = r.candidates[0];
              const art = c0 ? artById.get(c0.spotifyId) : undefined;
              return r.fromCache && c0 && art && !c0.albumArtUrl
                ? { ...r, candidates: [{ ...c0, albumArtUrl: art }, ...r.candidates.slice(1)] }
                : r;
            }),
          );
          for (const n of needArt) {
            const art = artById.get(n.spotifyId);
            if (art) void trackRepository.setTrackAlbumArt(n.trackId, art);
          }
        } catch {
          /* art is cosmetic — ignore (auth failures surface via the search loop below) */
        }
      }

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
                    confidence: r.confidence,
                  }
                : p,
            ),
          );
        } catch (e) {
          if (cancelled) return;
          if (isAuthError(e)) {
            setAuthError(true);
            return;
          }
          setRows((prev) => prev.map((p, idx) => (idx === i ? { ...p, status: "error" } : p)));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session.id, rebuild]);

  const selectedCount = rows.filter(
    (r) => r.selectedIndex !== null && r.candidates[r.selectedIndex],
  ).length;

  const choose = (rowIndex: number, value: number | null) => {
    setRows((prev) => prev.map((r, i) => (i === rowIndex ? { ...r, selectedIndex: value } : r)));
    setExpandedRow(null);
  };

  // Paste a Spotify link to override the match (covers tracks Spotify search can't find). Returns an
  // error message, or null on success (the resolved track becomes the selected candidate).
  const pasteLink = async (rowIndex: number, input: string): Promise<string | null> => {
    const id = parseSpotifyTrackId(input);
    if (!id) return "That doesn't look like a Spotify track link";
    try {
      const { candidate } = await resolveSpotifyTrack(id);
      setRows((prev) =>
        prev.map((r, i) =>
          i === rowIndex
            ? {
                ...r,
                status: "ready",
                candidates: [
                  candidate,
                  ...r.candidates.filter((c) => c.spotifyId !== candidate.spotifyId),
                ],
                selectedIndex: 0,
                confidence: "high",
                locked: false,
                fromCache: false,
              }
            : r,
        ),
      );
      return null;
    } catch (e) {
      if (isAuthError(e)) {
        setAuthError(true);
        return null;
      }
      return e instanceof Error ? e.message : "Couldn't resolve that link";
    }
  };

  // Re-run the search for a remembered track so the DJ can see album art + alternatives and re-pick
  // (a remembered match is a single stored candidate with no art). A new pick overwrites it on create.
  const rematch = async (rowIndex: number) => {
    const row = rows[rowIndex];
    if (!row) return;
    setRows((prev) => prev.map((r, i) => (i === rowIndex ? { ...r, status: "searching" } : r)));
    try {
      const r = await searchSpotify({
        artist: row.artist,
        title: row.title,
        ...(row.durationMs ? { durationMs: row.durationMs } : {}),
      });
      setRows((prev) =>
        prev.map((p, i) =>
          i === rowIndex
            ? {
                ...p,
                status: r.candidates.length ? "ready" : "unmatched",
                candidates: r.candidates,
                selectedIndex: r.recommendedIndex,
                confidence: r.confidence,
                locked: false,
                fromCache: false,
              }
            : p,
        ),
      );
      setExpandedRow(rowIndex); // open the list so the alternatives are visible
    } catch (e) {
      if (isAuthError(e)) setAuthError(true);
      else setRows((prev) => prev.map((p, i) => (i === rowIndex ? { ...p, status: "error" } : p)));
    }
  };

  const handleCreate = async () => {
    setCreating(true);
    setError(null);
    try {
      const chosen = rows
        .map((r, i) => ({
          c: r.selectedIndex !== null ? r.candidates[r.selectedIndex] : null,
          row: rows[i],
        }))
        .filter((x): x is { c: SpotifyCandidate; row: Row } => Boolean(x.c && x.row));

      // Spotify can't hold text "tracks", so list the un-matched songs in the playlist description
      // (alongside the DJ's optional note) — the closest thing to a per-song placeholder.
      // Number un-matched songs by their position in the set so a dancer reading the description
      // knows where the gap is. (Spotify collapses newlines in descriptions, so we separate with
      // " · " — the position number carries the ordering.)
      const unmatchedNames = rows
        .map((r, i) => ({ r, pos: i + 1 }))
        .filter(({ r }) => !(r.selectedIndex !== null && r.candidates[r.selectedIndex]))
        .map(({ r, pos }) => `${pos}. ${r.artist} - ${r.title}`);
      const descParts: string[] = [];
      if (note.trim()) descParts.push(note.trim());
      if (unmatchedNames.length) descParts.push(`Not on Spotify — ${unmatchedNames.join(" · ")}`);
      descParts.push("Made with Pika · pika.stream");
      const description = descParts.join(" — ").slice(0, 300);

      const result = await createSpotifyPlaylist({
        name: name.trim() || "Pika set",
        description,
        tracks: chosen.map(({ c, row }) => ({
          artist: row.artist,
          title: row.title,
          spotifyId: c.spotifyId,
          uri: c.uri,
        })),
      });

      await sessionRepository.setSessionPlaylist(session.id, result.playlistUrl, result.playlistId);
      await Promise.allSettled(
        chosen.map(({ c, row }) =>
          trackRepository.setTrackSpotifyMatch(row.trackId, {
            spotifyId: c.spotifyId,
            spotifyUrl: c.url,
            albumArtUrl: c.albumArtUrl ?? null,
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

  // The done screen's "Build a new playlist instead" — drop the remembered URL and re-run the load.
  const startRebuild = () => {
    setExistingUrl(null);
    setRebuild(true);
  };

  return {
    rows,
    loading,
    name,
    setName,
    note,
    setNote,
    creating,
    resultUrl,
    doneUrl,
    error,
    authError,
    expandedRow,
    setExpandedRow,
    syncState,
    syncing,
    syncError,
    selectedCount,
    choose,
    pasteLink,
    rematch,
    handleCreate,
    handleSync,
    handleUnsync,
    startRebuild,
  };
}
