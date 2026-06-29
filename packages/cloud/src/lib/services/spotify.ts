/**
 * Spotify service (Track D — Web DJ Spotify-source broadcaster, BFF).
 *
 * The cloud is a CONFIDENTIAL OAuth client: it holds the client secret and stores each DJ's
 * refresh token (encrypted) so it can poll their now-playing server-side. The refresh token
 * never reaches the browser. Scope: `user-read-currently-playing` (read-only).
 *
 * Flow: buildAuthorizeUrl → (Spotify) → connectSpotify(code) stores the encrypted refresh
 * token → fetchNowPlaying(djUserId) reads the current track (auto-refreshing the access token).
 */

import { logger, type TrackInfo } from "@pika/shared";
import { eq } from "drizzle-orm";
import { db } from "../../db";
import { serviceConnections, spotifyConnections } from "../../db/schema";
import { decryptSecret, encryptSecret } from "../crypto";

const SCOPE = "user-read-currently-playing";
const ACCOUNTS = "https://accounts.spotify.com";
const API = "https://api.spotify.com/v1";
const ACCESS_TOKEN_SKEW_MS = 30_000; // refresh this long before expiry

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/** DJ has never connected Spotify (or the connection row is gone). */
export class SpotifyNotConnectedError extends Error {
  constructor() {
    super("Spotify not connected");
    this.name = "SpotifyNotConnectedError";
  }
}

/** Refresh failed (revoked/expired) — the connection is now `needs_reauth`. */
export class SpotifyAuthError extends Error {
  constructor() {
    super("Spotify re-authorization required");
    this.name = "SpotifyAuthError";
  }
}

/** Spotify rate-limited us; honour `retryAfterMs` before retrying. */
export class SpotifyRateLimitError extends Error {
  constructor(public readonly retryAfterMs: number) {
    super("Spotify rate limit");
    this.name = "SpotifyRateLimitError";
  }
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

function getConfig(): { clientId: string; clientSecret: string; redirectUri: string } {
  // biome-ignore lint/complexity/useLiteralKeys: process.env requires brackets in strict TS
  const clientId = process.env["SPOTIFY_CLIENT_ID"];
  // biome-ignore lint/complexity/useLiteralKeys: process.env requires brackets in strict TS
  const clientSecret = process.env["SPOTIFY_CLIENT_SECRET"];
  // biome-ignore lint/complexity/useLiteralKeys: process.env requires brackets in strict TS
  const redirectUri = process.env["SPOTIFY_REDIRECT_URI"];
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("Spotify env not configured (SPOTIFY_CLIENT_ID/SECRET/REDIRECT_URI)");
  }
  return { clientId, clientSecret, redirectUri };
}

function basicAuth(): string {
  const { clientId, clientSecret } = getConfig();
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
}

// ---------------------------------------------------------------------------
// Authorization
// ---------------------------------------------------------------------------

/** Build the Spotify consent URL. `state` is an opaque CSRF token bound to the request. */
export function buildAuthorizeUrl(state: string): string {
  const { clientId, redirectUri } = getConfig();
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: SCOPE,
    state,
  });
  return `${ACCOUNTS}/authorize?${params}`;
}

interface SpotifyTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
}

/** Exchange the auth code for tokens and store the encrypted refresh token for this DJ. */
export async function connectSpotify(code: string, djUserId: string): Promise<void> {
  const { redirectUri } = getConfig();
  const res = await fetch(`${ACCOUNTS}/api/token`, {
    method: "POST",
    headers: { Authorization: basicAuth(), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }),
  });
  if (!res.ok) {
    throw new Error(`Spotify token exchange failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as SpotifyTokenResponse;
  if (!json.refresh_token) throw new Error("Spotify did not return a refresh token");

  const spotifyUserId = await fetchSpotifyUserId(json.access_token);
  const refreshTokenEnc = encryptSecret(json.refresh_token);

  await db
    .insert(spotifyConnections)
    .values({
      djUserId,
      refreshTokenEnc,
      scope: json.scope ?? SCOPE,
      spotifyUserId,
      status: "active",
    })
    .onConflictDoUpdate({
      target: spotifyConnections.djUserId,
      set: {
        refreshTokenEnc,
        scope: json.scope ?? SCOPE,
        spotifyUserId,
        status: "active",
        updatedAt: new Date(),
      },
    });

  // Seed the access-token cache so the first poll doesn't re-refresh.
  accessCache.set(djUserId, {
    accessToken: json.access_token,
    expiresAt: Date.now() + json.expires_in * 1000,
  });
  logger.info("🎧 Spotify connected", { djUserId });
}

async function fetchSpotifyUserId(accessToken: string): Promise<string | undefined> {
  try {
    const res = await fetch(`${API}/me`, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) return undefined;
    const json = (await res.json()) as { id?: string };
    return json.id;
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Access-token lifecycle (refresh + in-memory cache)
// ---------------------------------------------------------------------------

const accessCache = new Map<string, { accessToken: string; expiresAt: number }>();

async function getAccessToken(djUserId: string): Promise<string> {
  const cached = accessCache.get(djUserId);
  if (cached && Date.now() < cached.expiresAt - ACCESS_TOKEN_SKEW_MS) return cached.accessToken;
  return refreshAccessToken(djUserId);
}

/**
 * Mark a connection for re-auth (the stored token is unusable — revoked, or undecryptable after a
 * TOKEN_ENCRYPTION_KEY change / corruption) and surface it as an auth error so the poller stops
 * cleanly and the web UI shows a "Reconnect Spotify" prompt. Always throws.
 */
async function markNeedsReauth(djUserId: string, reason: string): Promise<never> {
  await db
    .update(spotifyConnections)
    .set({ status: "needs_reauth", updatedAt: new Date() })
    .where(eq(spotifyConnections.djUserId, djUserId));
  accessCache.delete(djUserId);
  logger.warn("⚠️ Spotify connection → needs_reauth", { djUserId, reason });
  throw new SpotifyAuthError();
}

async function refreshAccessToken(djUserId: string): Promise<string> {
  const [conn] = await db
    .select()
    .from(spotifyConnections)
    .where(eq(spotifyConnections.djUserId, djUserId))
    .limit(1);
  if (!conn) throw new SpotifyNotConnectedError();

  let refreshToken: string;
  try {
    refreshToken = decryptSecret(conn.refreshTokenEnc);
  } catch {
    // Undecryptable token (TOKEN_ENCRYPTION_KEY rotated/changed, or corrupt ciphertext) — the
    // stored credential is permanently unusable. Prompt a reconnect instead of looping errors.
    return markNeedsReauth(djUserId, "decrypt-failed");
  }
  const res = await fetch(`${ACCOUNTS}/api/token`, {
    method: "POST",
    headers: { Authorization: basicAuth(), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }),
  });

  if (!res.ok) {
    // invalid_grant → the DJ revoked access. Mark for re-auth so the poller stops cleanly.
    return markNeedsReauth(djUserId, `refresh-${res.status}`);
  }

  const json = (await res.json()) as SpotifyTokenResponse;
  // Spotify occasionally rotates the refresh token — persist it if so.
  if (json.refresh_token) {
    await db
      .update(spotifyConnections)
      .set({ refreshTokenEnc: encryptSecret(json.refresh_token), updatedAt: new Date() })
      .where(eq(spotifyConnections.djUserId, djUserId));
  }
  accessCache.set(djUserId, {
    accessToken: json.access_token,
    expiresAt: Date.now() + json.expires_in * 1000,
  });
  return json.access_token;
}

// ---------------------------------------------------------------------------
// Now playing
// ---------------------------------------------------------------------------

export interface NowPlaying {
  isPlaying: boolean;
  trackId: string; // Spotify track id — stable identity for change detection
  track: TrackInfo; // normalized for the broadcast pipe (title/artist + albumArtUrl/spotifyUrl)
  progressMs: number;
  durationMs: number;
}

export interface SpotifyCurrentlyPlaying {
  is_playing: boolean;
  progress_ms: number | null;
  item: {
    id: string;
    name: string;
    duration_ms: number;
    external_urls?: { spotify?: string };
    artists: Array<{ name: string }>;
    album?: { images?: Array<{ url: string }> };
  } | null;
}

/**
 * Normalize a Spotify currently-playing payload into our broadcast shape.
 * Pure (no I/O) so it's unit-testable. Returns `null` when there's no track.
 * NOTE: the currently-playing item does NOT include ISRC (validated via spike) — for
 * cross-provider matching a follow-up `/v1/tracks/{id}` fetch is required (deferred).
 */
export function normalizeNowPlaying(body: SpotifyCurrentlyPlaying): NowPlaying | null {
  if (!body.item) return null;
  const artist = body.item.artists.map((a) => a.name).join(", ");
  // Album art + the public "Listen on Spotify" link ride on the track itself, so they flow
  // through the unchanged broadcast pipe (emitTrack → applyNowPlaying → NOW_PLAYING → dancers).
  const track: TrackInfo = {
    title: body.item.name,
    artist,
    albumArtUrl: body.item.album?.images?.[0]?.url,
    spotifyUrl: body.item.external_urls?.spotify,
  };
  return {
    isPlaying: body.is_playing,
    trackId: body.item.id,
    track,
    progressMs: body.progress_ms ?? 0,
    durationMs: body.item.duration_ms,
  };
}

/**
 * Fetch the DJ's currently-playing track. Returns `null` when nothing is playing
 * (204 / no item / ad break). Throws {@link SpotifyAuthError} / {@link SpotifyRateLimitError}.
 */
export async function fetchNowPlaying(djUserId: string): Promise<NowPlaying | null> {
  let accessToken = await getAccessToken(djUserId);
  let res = await callCurrentlyPlaying(accessToken);

  // A 401 means the cached token went stale early — force one refresh + retry.
  if (res.status === 401) {
    accessToken = await refreshAccessToken(djUserId);
    res = await callCurrentlyPlaying(accessToken);
  }

  if (res.status === 204) return null;
  if (res.status === 429) {
    const retryAfter = Number(res.headers.get("Retry-After") ?? "1");
    throw new SpotifyRateLimitError(retryAfter * 1000);
  }
  if (!res.ok) throw new Error(`Spotify currently-playing failed: ${res.status}`);

  return normalizeNowPlaying((await res.json()) as SpotifyCurrentlyPlaying);
}

function callCurrentlyPlaying(accessToken: string): Promise<Response> {
  return fetch(`${API}/me/player/currently-playing`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

// ---------------------------------------------------------------------------
// Connection status (for the web UI)
// ---------------------------------------------------------------------------

export async function getConnectionStatus(
  djUserId: string,
): Promise<{ connected: boolean; status: string | null }> {
  const [conn] = await db
    .select({ status: spotifyConnections.status })
    .from(spotifyConnections)
    .where(eq(spotifyConnections.djUserId, djUserId))
    .limit(1);
  return { connected: !!conn, status: conn?.status ?? null };
}

// ---------------------------------------------------------------------------
// App token (Client Credentials) — for /search (B3). No user; not 5-seat-capped.
// ---------------------------------------------------------------------------

let appToken: { accessToken: string; expiresAt: number } | null = null;

/** A cached app-level access token for non-user endpoints (search). */
export async function getAppAccessToken(): Promise<string> {
  if (appToken && Date.now() < appToken.expiresAt - ACCESS_TOKEN_SKEW_MS)
    return appToken.accessToken;
  const res = await fetch(`${ACCOUNTS}/api/token`, {
    method: "POST",
    headers: { Authorization: basicAuth(), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials" }),
  });
  if (!res.ok) throw new Error(`Spotify app-token failed: ${res.status}`);
  const json = (await res.json()) as SpotifyTokenResponse;
  appToken = { accessToken: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
  return json.access_token;
}

// ---------------------------------------------------------------------------
// Service account (playlist creation, B3) — the single "Pika" account that owns
// every generated playlist. One-time owner OAuth (scope playlist-modify-public).
// ---------------------------------------------------------------------------

// playlist-modify-public → create playlists; the read scopes → list/read other DJs' PUBLIC
// playlists for the catalog seed (Spotify's user-playlists endpoint needs a USER token + these
// scopes; the app/Client-Credentials token is forbidden there). Adding a scope requires the owner
// to re-run the one-time /service/authorize consent.
const SERVICE_SCOPE = "playlist-modify-public playlist-read-private playlist-read-collaborative";
const SERVICE_NAME = "spotify-playlist";

/** The Pika service account isn't connected (owner must run the one-time OAuth). */
export class SpotifyServiceNotConnectedError extends Error {
  constructor() {
    super("Spotify playlist service not connected");
    this.name = "SpotifyServiceNotConnectedError";
  }
}

// The service OAuth uses its OWN redirect (derived from SPOTIFY_REDIRECT_URI by swapping the path);
// the owner registers BOTH redirect URIs in the Spotify app dashboard.
function serviceRedirectUri(): string {
  return getConfig().redirectUri.replace(/\/callback\/?$/, "/service/callback");
}

/** Consent URL for connecting the shared Pika account (admin-only, one-time per env). */
export function buildServiceAuthorizeUrl(state: string): string {
  const { clientId } = getConfig();
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: serviceRedirectUri(),
    scope: SERVICE_SCOPE,
    state,
  });
  return `${ACCOUNTS}/authorize?${params}`;
}

/** Exchange the service-account auth code and store its encrypted refresh token (one row). */
export async function connectServiceAccount(code: string): Promise<void> {
  const res = await fetch(`${ACCOUNTS}/api/token`, {
    method: "POST",
    headers: { Authorization: basicAuth(), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: serviceRedirectUri(),
    }),
  });
  if (!res.ok) {
    throw new Error(`Service token exchange failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as SpotifyTokenResponse;
  if (!json.refresh_token) throw new Error("Spotify did not return a refresh token");

  const spotifyUserId = await fetchSpotifyUserId(json.access_token);
  const refreshTokenEnc = encryptSecret(json.refresh_token);
  await db
    .insert(serviceConnections)
    .values({
      name: SERVICE_NAME,
      refreshTokenEnc,
      scope: json.scope ?? SERVICE_SCOPE,
      spotifyUserId,
      status: "active",
    })
    .onConflictDoUpdate({
      target: serviceConnections.name,
      set: {
        refreshTokenEnc,
        scope: json.scope ?? SERVICE_SCOPE,
        spotifyUserId,
        status: "active",
        updatedAt: new Date(),
      },
    });
  serviceToken = { accessToken: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
  logger.info("🎛️ Spotify playlist service account connected", { spotifyUserId });
}

let serviceToken: { accessToken: string; expiresAt: number } | null = null;

export async function getServiceAccessToken(): Promise<string> {
  if (serviceToken && Date.now() < serviceToken.expiresAt - ACCESS_TOKEN_SKEW_MS) {
    return serviceToken.accessToken;
  }
  const [conn] = await db
    .select()
    .from(serviceConnections)
    .where(eq(serviceConnections.name, SERVICE_NAME))
    .limit(1);
  if (!conn) throw new SpotifyServiceNotConnectedError();

  let refreshToken: string;
  try {
    refreshToken = decryptSecret(conn.refreshTokenEnc);
  } catch {
    throw new SpotifyServiceNotConnectedError();
  }
  const res = await fetch(`${ACCOUNTS}/api/token`, {
    method: "POST",
    headers: { Authorization: basicAuth(), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }),
  });
  if (!res.ok) {
    await db
      .update(serviceConnections)
      .set({ status: "needs_reauth", updatedAt: new Date() })
      .where(eq(serviceConnections.name, SERVICE_NAME));
    throw new SpotifyServiceNotConnectedError();
  }
  const json = (await res.json()) as SpotifyTokenResponse;
  if (json.refresh_token) {
    await db
      .update(serviceConnections)
      .set({ refreshTokenEnc: encryptSecret(json.refresh_token), updatedAt: new Date() })
      .where(eq(serviceConnections.name, SERVICE_NAME));
  }
  serviceToken = { accessToken: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
  return json.access_token;
}

/** Whether the shared playlist service account is connected + usable. */
export async function getServiceStatus(): Promise<{ connected: boolean; status: string | null }> {
  const [conn] = await db
    .select({ status: serviceConnections.status })
    .from(serviceConnections)
    .where(eq(serviceConnections.name, SERVICE_NAME))
    .limit(1);
  return { connected: !!conn, status: conn?.status ?? null };
}

/**
 * Create a public playlist on the Pika service account and add `trackUris` (≤100 per request).
 * Endpoints reflect Spotify's current API (Feb 2026): `POST /me/playlists` + `POST /playlists/{id}/items`.
 */
export async function createPlaylist(
  name: string,
  trackUris: string[],
  description?: string,
): Promise<{ playlistUrl: string; playlistId: string }> {
  const token = await getServiceAccessToken();
  const authHeaders = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const createRes = await fetch(`${API}/me/playlists`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      name,
      public: true,
      // Spotify caps the description ~300 chars; a playlist can't hold text "tracks", so unmatched
      // songs are listed here (built by the client).
      description: (description?.trim() || "Created with Pika · pika.stream").slice(0, 300),
    }),
  });
  if (!createRes.ok) {
    throw new Error(`Create playlist failed: ${createRes.status} ${await createRes.text()}`);
  }
  const playlist = (await createRes.json()) as {
    id: string;
    external_urls?: { spotify?: string };
  };

  for (let i = 0; i < trackUris.length; i += 100) {
    const batch = trackUris.slice(i, i + 100);
    const addRes = await fetch(`${API}/playlists/${playlist.id}/items`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ uris: batch }),
    });
    if (!addRes.ok) {
      throw new Error(`Add playlist items failed: ${addRes.status} ${await addRes.text()}`);
    }
  }

  return {
    playlistUrl:
      playlist.external_urls?.spotify ?? `https://open.spotify.com/playlist/${playlist.id}`,
    playlistId: playlist.id,
  };
}
