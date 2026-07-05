/**
 * Web-DJ control-channel client (Track D).
 *
 * Talks to the cloud BFF with the httpOnly session cookie (`credentials: "include"`) and the
 * X-Pika-Client CSRF header. The Spotify token never touches the browser — the cloud polls and
 * broadcasts; the browser only drives start/stop/share and reads status.
 */

import { getApiBaseUrl } from "./api";

const JSON_CSRF: HeadersInit = {
  "Content-Type": "application/json",
  "X-Pika-Client": "pika-web",
};

export interface DjUser {
  id: string; // Better Auth user id (string)
  email: string;
  displayName: string;
  slug: string;
  status: string; // 'pending' | 'approved' | 'rejected'
}

/** Subset of the Better Auth session user (get-session returns `{ session, user }`). */
interface BetterAuthSessionUser {
  id: string;
  email: string;
  name: string;
  slug?: string | null;
  status?: string | null;
}

export interface SpotifyStatus {
  connected: boolean;
  status: string | null; // 'active' | 'needs_reauth' | null
}

/** The DJ-side readout of the active poll (mirrors the cloud /status enrichment). */
export interface ActivePollStatus {
  pollId: number;
  question: string;
  options: string[];
  votes: number[];
  totalVotes: number;
  endsAt: string | null;
}

/** Aggregated tempo feedback for the DJ readout (counts of dancer votes). */
export interface TempoStatus {
  slower: number;
  perfect: number;
  faster: number;
  total: number;
}

/** The active announcement the DJ broadcast (so the UI can offer "Clear"). */
export interface ActiveAnnouncement {
  message: string;
  timestamp: string;
  endsAt?: string;
}

export interface LiveStatus {
  live: boolean;
  sessionId?: string;
  paused?: boolean; // DJ deliberately paused sharing
  betweenSongs?: boolean; // transient Spotify gap between tracks (not a deliberate pause)
  spotify: SpotifyStatus;
  activePoll?: ActivePollStatus | null;
  tempo?: TempoStatus | null;
  activeAnnouncement?: ActiveAnnouncement | null;
}

export class DjApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body: unknown,
  ) {
    super(message);
    this.name = "DjApiError";
  }
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${getApiBaseUrl()}${path}`, { credentials: "include", ...init });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const message = (body as { error?: string }).error ?? res.statusText;
    throw new DjApiError(res.status, message, body);
  }
  return (await res.json()) as T;
}

/** Current DJ from the session cookie, or null if not signed in. */
export async function getMe(): Promise<DjUser | null> {
  try {
    // Better Auth's get-session returns `{ session, user }`, or null/empty (HTTP 200)
    // when there is no valid session — so a missing user means "not signed in".
    const data = await req<{ user?: BetterAuthSessionUser } | null>("/api/auth/get-session");
    const u = data?.user;
    if (!u) return null;
    return {
      id: u.id,
      email: u.email,
      displayName: u.name, // Better Auth stores the display name as `name`
      slug: u.slug ?? "",
      status: u.status ?? "pending",
    };
  } catch (e) {
    if (e instanceof DjApiError && e.status === 401) return null;
    throw e;
  }
}

export function getLiveStatus(): Promise<LiveStatus> {
  return req<LiveStatus>("/api/live/status");
}

export function startLive(): Promise<{ success: boolean; sessionId: string }> {
  return req("/api/live/start", { method: "POST", headers: JSON_CSRF });
}

export function stopLive(): Promise<{ success: boolean }> {
  return req("/api/live/stop", { method: "POST", headers: JSON_CSRF });
}

export function setShare(paused: boolean): Promise<{ success: boolean; paused: boolean }> {
  return req("/api/live/share", {
    method: "POST",
    headers: JSON_CSRF,
    body: JSON.stringify({ paused }),
  });
}

/** Broadcast a transient announcement to the floor (optionally as a mobile push). */
export function sendAnnouncement(
  message: string,
  durationSeconds?: number,
  push?: boolean,
): Promise<{ success: boolean }> {
  return req("/api/live/announcement", {
    method: "POST",
    headers: JSON_CSRF,
    body: JSON.stringify({
      message,
      ...(durationSeconds ? { durationSeconds } : {}),
      ...(push ? { push } : {}),
    }),
  });
}

/** Clear the active announcement for everyone (broadcasts ANNOUNCEMENT_CANCELLED). */
export function cancelAnnouncement(): Promise<{ success: boolean }> {
  return req("/api/live/announcement/cancel", { method: "POST", headers: JSON_CSRF });
}

/** Start a live poll on the DJ's session. */
export function startPoll(params: {
  question: string;
  options: string[];
  durationSeconds?: number;
}): Promise<{ success: boolean; pollId: number }> {
  return req("/api/live/poll/start", {
    method: "POST",
    headers: JSON_CSRF,
    body: JSON.stringify(params),
  });
}

/** End the active poll on the DJ's session. */
export function endPoll(): Promise<{ success: boolean }> {
  return req("/api/live/poll/end", { method: "POST", headers: JSON_CSRF });
}

/** Top-level navigation target to (re)connect Spotify — sends the session cookie. */
export function spotifyAuthorizeUrl(): string {
  return `${getApiBaseUrl()}/api/spotify/authorize`;
}

// ── Slice 5: DJ profile management (publish-toggle + external playlists) ─────────────────────────

export interface MySession {
  id: string;
  djName: string;
  startedAt: string | null;
  endedAt: string | null;
  published: boolean;
  // The synced Spotify set-playlist (desktop-built or web-broadcast auto-built). Present → the DJ
  // can unshare it here; re-sharing stays desktop-only (it holds the playlist id).
  spotifyPlaylistId: string | null;
  spotifyPlaylistUrl: string | null;
  trackCount: number;
}

export interface MyPlaylist {
  id: number;
  url: string;
  spotifyPlaylistId: string | null;
}

/** My sessions (incl. hidden) with their publish state — for the profile-management list. */
export function getMySessions(): Promise<{ sessions: MySession[] }> {
  return req("/api/dj/me/sessions");
}

/** Show/hide one of my sessions on my public /dj/[slug] profile. */
export function setSessionPublished(id: string, published: boolean): Promise<{ success: boolean }> {
  return req(`/api/dj/me/sessions/${id}`, {
    method: "PATCH",
    headers: JSON_CSRF,
    body: JSON.stringify({ published }),
  });
}

/** Un-share the synced Spotify set-playlist from one of my sets (nulls it on the session). */
export function unshareSessionPlaylist(id: string): Promise<{ success: boolean }> {
  return req(`/api/dj/me/sessions/${id}/playlist`, { method: "DELETE", headers: JSON_CSRF });
}

/** My embedded Spotify playlists. */
export function getMyPlaylists(): Promise<{ playlists: MyPlaylist[] }> {
  return req("/api/dj/me/playlists");
}

/** Add a public Spotify playlist (paste a link) to my profile. */
export function addPlaylist(url: string): Promise<{ success: boolean; spotifyPlaylistId: string }> {
  return req("/api/dj/me/playlists", {
    method: "POST",
    headers: JSON_CSRF,
    body: JSON.stringify({ url }),
  });
}

/** Remove one of my embedded playlists. */
export function removePlaylist(id: number): Promise<{ success: boolean }> {
  return req(`/api/dj/me/playlists/${id}`, { method: "DELETE", headers: JSON_CSRF });
}

// ── Booth management (Slice C) ───────────────────────────────────────────────

export interface MyGig {
  id: number;
  date: string; // YYYY-MM-DD
  title: string;
  city: string | null;
  url: string | null;
}

export interface MyBooth {
  bio: string | null;
  showFollowerCount: boolean;
  followerCount: number; // the owner ALWAYS sees their count
  gigs: MyGig[]; // all gigs, incl. past (public payload shows upcoming only)
}

/** My Booth content for the editor. */
export function getMyBooth(): Promise<MyBooth> {
  return req("/api/dj/me/booth");
}

/** Update my bio and/or the public follower-count toggle. */
export function updateBooth(patch: {
  bio?: string;
  showFollowerCount?: boolean;
}): Promise<{ success: boolean }> {
  return req("/api/dj/me/booth", {
    method: "PATCH",
    headers: JSON_CSRF,
    body: JSON.stringify(patch),
  });
}

/** Add an upcoming gig to my Booth. */
export function addGig(gig: {
  date: string;
  title: string;
  city?: string;
  url?: string;
}): Promise<{ success: boolean; id: number }> {
  return req("/api/dj/me/gigs", { method: "POST", headers: JSON_CSRF, body: JSON.stringify(gig) });
}

/** Remove one of my gigs. */
export function removeGig(id: number): Promise<{ success: boolean }> {
  return req(`/api/dj/me/gigs/${id}`, { method: "DELETE", headers: JSON_CSRF });
}

// ── Email preferences (Slice C — shared /api/me surface, works for DJs too) ─────

export interface EmailPreferences {
  recapEmails: boolean;
  djDigest: boolean;
  djDigestAvailable: boolean;
}

export function getEmailPreferences(): Promise<EmailPreferences> {
  return req("/api/me/preferences");
}

export function updateEmailPreferences(patch: {
  recapEmails?: boolean;
  djDigest?: boolean;
}): Promise<{ recapEmails: boolean; djDigest: boolean }> {
  return req("/api/me/preferences", {
    method: "PUT",
    headers: JSON_CSRF,
    body: JSON.stringify(patch),
  });
}
