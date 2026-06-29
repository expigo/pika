/**
 * Spotify catalog reads (B3 seed) — fetch a DJ's PUBLIC playlists + their tracks for the admin seed
 * tool. Uses the SERVICE account's user token (the owner's connected account): Spotify's
 * user-playlists endpoint is deprecated + needs a USER token with playlist-read scopes; the
 * app/Client-Credentials token is forbidden there. The service account must be connected with the
 * read scopes (re-run /api/spotify/service/authorize after this change).
 */

import { getServiceAccessToken } from "./spotify";

const API = "https://api.spotify.com/v1";

export interface PlaylistSummary {
  playlistId: string;
  name: string;
  trackCount: number;
  url: string;
}

export interface PlaylistTrack {
  spotifyId: string;
  uri: string;
  name: string;
  artists: string;
  durationMs: number;
  albumArtUrl?: string;
}

/** Extract the Spotify user id from a profile URL (`open.spotify.com/user/<id>`) or a bare id. */
export function parseSpotifyUserId(input: string): string | null {
  const s = input.trim();
  const m = s.match(/user\/([^/?#]+)/i);
  if (m?.[1]) return decodeURIComponent(m[1]);
  // Bare id: Spotify user ids are alphanumeric (vanity) — accept a plain token without slashes.
  return /^[A-Za-z0-9._~-]+$/.test(s) ? s : null;
}

async function getJson<T>(token: string, url: string): Promise<T> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Spotify ${url} failed: ${res.status}`);
  return (await res.json()) as T;
}

interface SpotifyPlaylistsPage {
  items: Array<{
    id: string;
    name: string;
    tracks?: { total?: number };
    external_urls?: { spotify?: string };
  } | null>;
  next: string | null;
}

/** A user's PUBLIC playlists (paginated). */
export async function fetchUserPlaylists(userId: string): Promise<PlaylistSummary[]> {
  const token = await getServiceAccessToken();
  const out: PlaylistSummary[] = [];
  let url: string | null = `${API}/users/${encodeURIComponent(userId)}/playlists?limit=50`;
  while (url) {
    const page: SpotifyPlaylistsPage = await getJson(token, url);
    for (const p of page.items) {
      if (!p) continue;
      out.push({
        playlistId: p.id,
        name: p.name,
        trackCount: p.tracks?.total ?? 0,
        url: p.external_urls?.spotify ?? `https://open.spotify.com/playlist/${p.id}`,
      });
    }
    url = page.next;
  }
  return out;
}

interface SpotifyPlaylistItemsPage {
  items: Array<{
    track: {
      id: string | null;
      uri: string;
      name: string;
      duration_ms: number;
      artists: Array<{ name: string }>;
      album?: { images?: Array<{ url: string }> };
    } | null;
  }>;
  next: string | null;
}

/** Every (non-local) track in a public playlist (paginated). */
export async function fetchPlaylistTracks(playlistId: string): Promise<PlaylistTrack[]> {
  const token = await getServiceAccessToken();
  const out: PlaylistTrack[] = [];
  let url: string | null = `${API}/playlists/${encodeURIComponent(playlistId)}/tracks?limit=100`;
  while (url) {
    const page: SpotifyPlaylistItemsPage = await getJson(token, url);
    for (const it of page.items) {
      const t = it.track;
      if (!t?.id) continue; // skip local files / removed tracks
      out.push({
        spotifyId: t.id,
        uri: t.uri,
        name: t.name,
        artists: t.artists.map((a) => a.name).join(", "),
        durationMs: t.duration_ms,
        ...(t.album?.images?.[0]?.url ? { albumArtUrl: t.album.images[0].url } : {}),
      });
    }
    url = page.next;
  }
  return out;
}
