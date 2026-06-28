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

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const { apiUrl } = getConfiguredUrls();
  const res = await apiFetch(`${apiUrl}${path}`, { method: "POST", body: JSON.stringify(body) });
  if (!res.ok) {
    const detail = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(detail.error ?? `Request failed: ${res.status}`);
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

/** Create the playlist on the shared account from the DJ's confirmed tracks. */
export function createSpotifyPlaylist(input: {
  name: string;
  tracks: Array<{ artist: string; title: string; spotifyId: string; uri: string }>;
}): Promise<{ success: boolean; playlistUrl: string; playlistId: string }> {
  return postJson("/api/playlist/create", input);
}
