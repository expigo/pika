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
  id: number;
  email: string;
  displayName: string;
  slug: string;
  status: string; // 'pending' | 'approved'
}

export interface SpotifyStatus {
  connected: boolean;
  status: string | null; // 'active' | 'needs_reauth' | null
}

export interface LiveStatus {
  live: boolean;
  sessionId?: string;
  paused?: boolean;
  spotify: SpotifyStatus;
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
    const { user } = await req<{ user: DjUser }>("/api/auth/me");
    return user;
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

/** Top-level navigation target to (re)connect Spotify — sends the session cookie. */
export function spotifyAuthorizeUrl(): string {
  return `${getApiBaseUrl()}/api/spotify/authorize`;
}
