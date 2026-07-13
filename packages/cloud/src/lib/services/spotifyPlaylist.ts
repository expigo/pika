/**
 * Spotify service account + playlist operations (B3) — the single "Pika" account that owns every
 * generated playlist: one-time owner OAuth, its token lifecycle (`serviceToken` cache — the sole
 * module state, single-owner), and playlist create/replace against the current
 * `/playlists/{id}/items` endpoints. Split (2026-07) from spotify.ts, behavior-preserving;
 * spotify.ts keeps the per-DJ OAuth/now-playing/app-token core and re-exports this module as a
 * compatibility facade. Dependency is one-way at evaluation time (this file → the core's exported
 * primitives; the facade back-edge performs no evaluation-time reads).
 */

import { logger } from "@pika/shared";
import { eq } from "drizzle-orm";
import { db } from "../../db";
import { serviceConnections } from "../../db/schema";
import { decryptSecret, encryptSecret } from "../crypto";
import {
  ACCESS_TOKEN_SKEW_MS,
  ACCOUNTS,
  API,
  basicAuth,
  fetchSpotifyUserId,
  getConfig,
  SpotifyRateLimitError,
  type SpotifyTokenResponse,
} from "./spotify";

/** The playlist id no longer exists on Spotify (deleted on the service account). */
export class SpotifyPlaylistNotFoundError extends Error {
  constructor() {
    super("Spotify playlist not found");
    this.name = "SpotifyPlaylistNotFoundError";
  }
}

// ---------------------------------------------------------------------------
// Service account (playlist creation, B3) — the single "Pika" account that owns
// every generated playlist. One-time owner OAuth (scope playlist-modify-public).
// ---------------------------------------------------------------------------

// playlist-modify-public → create playlists; the read scopes → list/read other DJs' PUBLIC
// playlists for the catalog seed (Spotify's user-playlists endpoint needs a USER token + these
// scopes; the app/Client-Credentials token is forbidden there). Adding a scope requires the owner
// to re-run the one-time /service/authorize consent.
// playlist-modify-private lets journal playlists be created UNLISTED (link-only, off the account
// profile). NOTE: a stored refresh token keeps its original scopes — after adding a scope here the
// owner must re-run the one-time service authorize per env; until then createPlaylist degrades
// private→public with a warning instead of failing exports.
const SERVICE_SCOPE =
  "playlist-modify-public playlist-modify-private playlist-read-private playlist-read-collaborative";
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

/** Throw `SpotifyRateLimitError` when Spotify says 429 (mirrors fetchNowPlaying's handling). */
function throwIfRateLimited(res: Response): void {
  if (res.status === 429) {
    const retryAfterSec = Number(res.headers.get("Retry-After") ?? "1");
    throw new SpotifyRateLimitError((Number.isFinite(retryAfterSec) ? retryAfterSec : 1) * 1000);
  }
}

/**
 * Create a playlist on the Pika service account and add `trackUris` (≤100 per request).
 * Endpoints reflect Spotify's current API (Feb 2026): `POST /me/playlists` + `POST /playlists/{id}/items`.
 * `opts.isPublic: false` creates it UNLISTED (link-only, off the account profile — "public" on
 * Spotify only controls profile/search visibility, never link access). Default stays public
 * (DJ set playlists are meant for public display/embeds).
 */
export async function createPlaylist(
  name: string,
  trackUris: string[],
  description?: string,
  opts?: { isPublic?: boolean },
): Promise<{ playlistUrl: string; playlistId: string }> {
  const token = await getServiceAccessToken();
  const authHeaders = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const wantPublic = opts?.isPublic ?? true;

  const create = (isPublic: boolean) =>
    fetch(`${API}/me/playlists`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        name,
        public: isPublic,
        // Spotify caps the description ~300 chars; a playlist can't hold text "tracks", so unmatched
        // songs are listed here (built by the client).
        description: (description?.trim() || "Created with Pika · pika.stream").slice(0, 300),
      }),
    });

  let createRes = await create(wantPublic);
  if (!wantPublic && createRes.status === 403) {
    // The stored token predates the playlist-modify-private scope (service re-auth pending) —
    // degrade to a public playlist rather than failing the dancer's export.
    logger.warn(
      "⚠️ Private playlist creation lacks scope — created PUBLIC; re-authorize the Spotify service account",
    );
    createRes = await create(true);
  }
  throwIfRateLimited(createRes);
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
    throwIfRateLimited(addRes);
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

/**
 * Split URIs for an in-place replace: one `PUT` (replaces the playlist's entire contents, ≤100
 * URIs) followed by `POST` appends for the rest. Pure — unit-tested without token/DB.
 */
export function planReplaceBatches(trackUris: string[]): { put: string[]; posts: string[][] } {
  const put = trackUris.slice(0, 100);
  const posts: string[][] = [];
  for (let i = 100; i < trackUris.length; i += 100) {
    posts.push(trackUris.slice(i, i + 100));
  }
  return { put, posts };
}

/**
 * Replace a playlist's contents in place: `PUT /playlists/{id}/items` overwrites existing items
 * (verified current endpoint; the `/tracks` variant is deprecated), then remaining 100-URI batches
 * are appended. Throws `SpotifyPlaylistNotFoundError` on 404 (deleted on the service account),
 * `SpotifyRateLimitError` on 429.
 */
/**
 * Whether a playlist-write status means the stored playlist is effectively gone/unusable.
 * Spotify never hard-deletes: "delete" in the app = the owner UNFOLLOWS the playlist (the object
 * survives, recoverable for ~90 days) — and writes to it then surface as 403/400 rather than the
 * 404 a true deletion would give. All three mean "stop trying to update this id": the caller
 * recreates, which either succeeds (playlist was gone) or fails identically (surfacing the real
 * error). 429 (rate limit) and 5xx (transient) are deliberately NOT included — recreating on a
 * transient failure would mint orphan playlists.
 */
export function isPlaylistGoneStatus(status: number): boolean {
  return status === 400 || status === 403 || status === 404;
}

export async function replacePlaylistItems(playlistId: string, trackUris: string[]): Promise<void> {
  const token = await getServiceAccessToken();
  const authHeaders = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const { put, posts } = planReplaceBatches(trackUris);

  const putRes = await fetch(`${API}/playlists/${playlistId}/items`, {
    method: "PUT",
    headers: authHeaders,
    body: JSON.stringify({ uris: put }),
  });
  if (isPlaylistGoneStatus(putRes.status)) throw new SpotifyPlaylistNotFoundError();
  throwIfRateLimited(putRes);
  if (!putRes.ok) {
    throw new Error(`Replace playlist items failed: ${putRes.status} ${await putRes.text()}`);
  }

  for (const batch of posts) {
    const addRes = await fetch(`${API}/playlists/${playlistId}/items`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ uris: batch }),
    });
    if (isPlaylistGoneStatus(addRes.status)) throw new SpotifyPlaylistNotFoundError();
    throwIfRateLimited(addRes);
    if (!addRes.ok) {
      throw new Error(`Append playlist items failed: ${addRes.status} ${await addRes.text()}`);
    }
  }
}
