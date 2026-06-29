/**
 * Admin panel API client (internal). Cookie-authenticated (`credentials:"include"`) + the
 * X-Pika-Client CSRF header, mirroring `lib/djLive.ts`. Non-admins get 404 from the server —
 * `getAdminMe()` maps that (and 401) to `null` so the UI can gate.
 */

import type { SpotifyAudioFeatures } from "@pika/shared";
import { getApiBaseUrl } from "./api";

const JSON_CSRF: HeadersInit = {
  "Content-Type": "application/json",
  "X-Pika-Client": "pika-web",
};

export interface AdminMe {
  id: number;
  displayName: string;
  role: string;
}

export interface AdminDj {
  id: string; // Better Auth user id (string)
  email: string;
  displayName: string;
  slug: string;
  status: string; // 'pending' | 'approved' | 'rejected'
  role: string; // 'dj' | 'admin'
  createdAt: string;
  lastSeen: string | null;
  spotifyStatus: string | null; // 'active' | 'needs_reauth' | null
}

export interface OverviewSession {
  sessionId: string;
  djName: string;
  currentTrack: { title: string; artist: string } | null;
  startedAt: string;
  stageName: string | null;
  listeners: number;
  source: "spotify" | "vdj";
}

export interface AdminOverview {
  sessions: OverviewSession[];
  pollers: Array<{ sessionId: string; djUserId: number; status: string; heartbeatAt: string }>;
  stages: Array<{ id: string; name: string; eventId: string | null }>;
  events: Array<{ id: string; name: string }>;
  connections: number;
  generatedAt: string;
}

export class AdminApiError extends Error {
  constructor(
    public readonly status: number,
    message?: string,
  ) {
    super(message ?? `admin api ${status}`);
    this.name = "AdminApiError";
  }
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${getApiBaseUrl()}${path}`, { credentials: "include", ...init });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new AdminApiError(res.status, body.error);
  }
  return (await res.json()) as T;
}

/** The current admin, or null if not signed in / not an admin (401/404). */
export async function getAdminMe(): Promise<AdminMe | null> {
  try {
    return await req<AdminMe>("/api/admin/me");
  } catch (e) {
    if (e instanceof AdminApiError && (e.status === 401 || e.status === 404)) return null;
    throw e;
  }
}

export async function getDjs(): Promise<AdminDj[]> {
  return (await req<{ djs: AdminDj[] }>("/api/admin/djs")).djs;
}

export function approveDj(id: string): Promise<{ success: boolean }> {
  return req(`/api/admin/djs/${id}/approve`, { method: "POST", headers: JSON_CSRF });
}

export function rejectDj(id: string): Promise<{ success: boolean }> {
  return req(`/api/admin/djs/${id}/reject`, { method: "POST", headers: JSON_CSRF });
}

// --- B3 catalog seed tool ---

export interface SeedPlaylist {
  playlistId: string;
  name: string;
  trackCount: number;
  url: string;
}

export interface SeedTrack {
  spotifyId: string;
  uri: string;
  name: string;
  artists: string;
  durationMs?: number;
  albumArtUrl?: string;
  // Canonical Spotify audio features — present only for CSV (Exportify) imports.
  features?: SpotifyAudioFeatures;
}

/** A DJ's public Spotify playlists, from their profile link. */
export function getSeedPlaylists(
  profile: string,
): Promise<{ userId: string; playlists: SeedPlaylist[] }> {
  return req(`/api/admin/seed/playlists?profile=${encodeURIComponent(profile)}`);
}

/** Preview a playlist's tracks before seeding. */
export function getSeedPlaylistTracks(playlistId: string): Promise<{ tracks: SeedTrack[] }> {
  return req(`/api/admin/seed/playlist/${encodeURIComponent(playlistId)}/tracks`);
}

/** Seed the chosen tracks into the catalog, attributed to a DJ. */
export function seedCurated(body: {
  djUserId: string;
  playlistName?: string;
  tracks: SeedTrack[];
}): Promise<{ success: boolean; seeded: number }> {
  return req("/api/admin/seed/curate", {
    method: "POST",
    headers: JSON_CSRF,
    body: JSON.stringify(body),
  });
}

export function getOverview(): Promise<AdminOverview> {
  return req<AdminOverview>("/api/admin/overview");
}

// --- B3 Songs Catalog (seeded repertoire visualizer) ---

export interface AdminCatalog {
  totals: { tracks: number; features: number; djs: number; overlap: number };
  coverage: { tempo: number; genres: number };
  perDj: Array<{ djName: string; count: number }>;
  tempo: Array<{ bucket: number; count: number }>; // 10-BPM bins
  keys: Array<{ key: number; count: number }>; // pitch class 0-11
  energy: Array<{ bucket: number; count: number }>; // 0-1 in 0.1 bins
  topOverlap: Array<{
    name: string;
    artists: string;
    djCount: number;
    popularity: number | null;
  }>;
  generatedAt: string;
}

/** Aggregates over the seeded catalog (feature distributions + cross-DJ overlap). */
export function getCatalog(): Promise<AdminCatalog> {
  return req<AdminCatalog>("/api/admin/catalog");
}

export interface CatalogSong {
  spotifyId: string;
  name: string;
  artists: string;
  djCount: number;
  playlistCount: number;
  tempo: number | null;
  keyPitch: number | null;
  mode: number | null;
  energy: number | null;
  danceability: number | null;
  valence: number | null;
  popularity: number | null;
}

export interface CatalogSongList {
  total: number;
  limit: number;
  offset: number;
  songs: CatalogSong[];
}

export interface CatalogSongDetail {
  spotifyId: string;
  name: string;
  artists: string;
  durationMs: number | null;
  albumArtUrl: string | null;
  // Canonical Spotify features (null fields where Exportify had none).
  spotify: Record<keyof SpotifyAudioFeatures, number | string | null> | null;
  // Pika sidecar features — per-file, surfaced once played_tracks carries spotify_id (kept separate).
  pika: null;
  appearances: Array<{ playlistName: string; djName: string; source: string }>;
}

/** Paginated/searchable song list. */
export function getCatalogSongs(params: {
  q?: string;
  sort?: string;
  dir?: string;
  limit?: number;
  offset?: number;
}): Promise<CatalogSongList> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v != null && v !== "") qs.set(k, String(v));
  return req<CatalogSongList>(`/api/admin/catalog/songs?${qs.toString()}`);
}

/** One song: full Spotify features + every DJ/playlist it appears in. */
export function getCatalogSong(spotifyId: string): Promise<CatalogSongDetail> {
  return req<CatalogSongDetail>(`/api/admin/catalog/songs/${encodeURIComponent(spotifyId)}`);
}

/** Status of the shared "Pika" Spotify playlist account (B3). */
export function getPlaylistServiceStatus(): Promise<{ connected: boolean; status: string | null }> {
  return req("/api/spotify/service/status");
}

/** Top-level navigation target to connect/reconnect the shared playlist account (admin, one-time). */
export function playlistServiceAuthorizeUrl(): string {
  return `${getApiBaseUrl()}/api/spotify/service/authorize`;
}
