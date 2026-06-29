/**
 * Spotify playlist client (B3) — thin wrapper over the cloud proxy. The desktop never holds Spotify
 * credentials: it sends a track (artist/title[+duration]) to `/api/playlist/search` for ranked
 * candidates, and the confirmed set to `/api/playlist/create` (created on the shared Pika account).
 */

import { apiFetch } from "./apiClient";
import { getConfiguredUrls } from "./settingsService";

export interface SpotifyCandidate {
  spotifyId: string;
  uri: string;
  url: string;
  name: string;
  artists: string;
  durationMs: number;
  popularity: number;
  albumArtUrl?: string;
}

export interface MatchResult {
  candidates: SpotifyCandidate[];
  recommendedIndex: number | null;
  confidence: "high" | "medium" | "low" | "none";
  cached: boolean;
}

/** Thrown on a non-2xx playlist API response; `status` lets callers special-case auth (401/403). */
export class PlaylistApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "PlaylistApiError";
  }
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const { apiUrl } = getConfiguredUrls();
  const res = await apiFetch(`${apiUrl}${path}`, { method: "POST", body: JSON.stringify(body) });
  if (!res.ok) {
    const detail = (await res.json().catch(() => ({}))) as { error?: string };
    throw new PlaylistApiError(res.status, detail.error ?? `Request failed: ${res.status}`);
  }
  return (await res.json()) as T;
}

/** Resolve a played track → ranked Spotify candidates (recommended first). */
export function searchSpotify(input: {
  artist: string;
  title: string;
  durationMs?: number;
}): Promise<MatchResult> {
  return postJson<MatchResult>("/api/playlist/search", input);
}

/** Extract a Spotify track id from a pasted URL / URI / bare id (22-char base62), or null. */
export function parseSpotifyTrackId(input: string): string | null {
  const s = input.trim();
  const m = s.match(/track[/:]([A-Za-z0-9]{22})/);
  if (m?.[1]) return m[1];
  return /^[A-Za-z0-9]{22}$/.test(s) ? s : null;
}

/** Resolve a pasted Spotify track id → a candidate (manual override for un-/mis-matched tracks). */
export function resolveSpotifyTrack(spotifyId: string): Promise<{ candidate: SpotifyCandidate }> {
  return postJson("/api/playlist/resolve", { spotifyId });
}

/** Create the playlist on the shared account from the DJ's confirmed tracks. */
export function createSpotifyPlaylist(input: {
  name: string;
  tracks: Array<{ artist: string; title: string; spotifyId: string; uri: string }>;
}): Promise<{ success: boolean; playlistUrl: string; playlistId: string }> {
  return postJson("/api/playlist/create", input);
}
