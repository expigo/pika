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

export interface LiveStatus {
  live: boolean;
  sessionId?: string;
  paused?: boolean;
  spotify: SpotifyStatus;
  activePoll?: ActivePollStatus | null;
  tempo?: TempoStatus | null;
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
