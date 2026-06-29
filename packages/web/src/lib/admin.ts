/**
 * Admin panel API client (internal). Cookie-authenticated (`credentials:"include"`) + the
 * X-Pika-Client CSRF header, mirroring `lib/djLive.ts`. Non-admins get 404 from the server —
 * `getAdminMe()` maps that (and 401) to `null` so the UI can gate.
 */

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

class AdminApiError extends Error {
  constructor(public readonly status: number) {
    super(`admin api ${status}`);
  }
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${getApiBaseUrl()}${path}`, { credentials: "include", ...init });
  if (!res.ok) throw new AdminApiError(res.status);
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

/** Status of the shared "Pika" Spotify playlist account (B3). */
export function getPlaylistServiceStatus(): Promise<{ connected: boolean; status: string | null }> {
  return req("/api/spotify/service/status");
}

/** Top-level navigation target to connect/reconnect the shared playlist account (admin, one-time). */
export function playlistServiceAuthorizeUrl(): string {
  return `${getApiBaseUrl()}/api/spotify/service/authorize`;
}
