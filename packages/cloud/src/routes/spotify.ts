/**
 * Spotify OAuth routes (Track D — BFF).
 *
 * GET /api/spotify/authorize  → redirect the DJ to Spotify consent (sets a CSRF state cookie)
 * GET /api/spotify/callback   → exchange the code, store the encrypted refresh token, bounce to web
 * GET /api/spotify/status     → { connected, status } for the web UI
 *
 * All routes require an authenticated DJ (Bearer or session cookie). These are GET navigations,
 * so they're exempt from the X-Pika-Client CSRF check; the OAuth `state` cookie defends the flow.
 */

import { logger, type PikaEnvironment, URLS } from "@pika/shared";
import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { getUser, requireAdmin, requireDjAuth } from "../lib/auth";
import {
  buildAuthorizeUrl,
  buildServiceAuthorizeUrl,
  connectServiceAccount,
  connectSpotify,
  getConnectionStatus,
  getServiceStatus,
} from "../lib/services/spotify";

const spotify = new Hono();

const OAUTH_STATE_COOKIE = "spotify_oauth_state";
const SERVICE_STATE_COOKIE = "spotify_service_oauth_state";
const STATE_MAX_AGE_S = 600; // 10 minutes to complete consent

function webBaseUrl(): string {
  // Explicit override (used in local dev where the web origin isn't the URLS default).
  // biome-ignore lint/complexity/useLiteralKeys: process.env requires brackets in strict TS
  const override = process.env["WEB_BASE_URL"];
  if (override) return override;
  // biome-ignore lint/complexity/useLiteralKeys: process.env requires brackets in strict TS
  const node = process.env["NODE_ENV"];
  const env: PikaEnvironment =
    node === "production" ? "production" : node === "staging" ? "staging" : "development";
  return URLS.getWebUrl(env);
}

/** Redirect the DJ to Spotify's consent screen. */
spotify.get("/authorize", requireDjAuth, (c) => {
  const state = crypto.randomUUID();
  setCookie(c, OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    // biome-ignore lint/complexity/useLiteralKeys: process.env requires brackets in strict TS
    secure: process.env["NODE_ENV"] === "production",
    sameSite: "Lax", // sent on the top-level GET redirect back from Spotify
    path: "/",
    maxAge: STATE_MAX_AGE_S,
  });
  return c.redirect(buildAuthorizeUrl(state));
});

/** OAuth callback: verify state, exchange the code, store the connection, bounce to the web app. */
spotify.get("/callback", requireDjAuth, async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");
  const error = c.req.query("error");
  const expected = getCookie(c, OAUTH_STATE_COOKIE);
  deleteCookie(c, OAUTH_STATE_COOKIE, { path: "/" });

  const web = webBaseUrl();
  if (error) return c.redirect(`${web}/dj/live?spotify=denied`);
  if (!code || !state || !expected || state !== expected) {
    return c.redirect(`${web}/dj/live?spotify=invalid`);
  }

  try {
    await connectSpotify(code, getUser(c).id);
    return c.redirect(`${web}/dj/live?spotify=connected`);
  } catch (e) {
    logger.error("Spotify callback failed", e);
    return c.redirect(`${web}/dj/live?spotify=error`);
  }
});

/** Connection status for the web UI. */
spotify.get("/status", requireDjAuth, async (c) => {
  return c.json(await getConnectionStatus(getUser(c).id));
});

// ---------------------------------------------------------------------------
// Service account (B3) — one-time, admin-only OAuth that connects the shared "Pika"
// account used to create every generated playlist. Its own redirect URI
// (…/api/spotify/service/callback) must also be registered in the Spotify app.
// ---------------------------------------------------------------------------

/** Admin: is the shared playlist account connected? (drives the admin-panel button) */
spotify.get("/service/status", requireAdmin, async (c) => {
  return c.json(await getServiceStatus());
});

/** Admin: start the one-time consent for the shared playlist account. */
spotify.get("/service/authorize", requireAdmin, (c) => {
  const state = crypto.randomUUID();
  setCookie(c, SERVICE_STATE_COOKIE, state, {
    httpOnly: true,
    // biome-ignore lint/complexity/useLiteralKeys: process.env requires brackets in strict TS
    secure: process.env["NODE_ENV"] === "production",
    sameSite: "Lax",
    path: "/",
    maxAge: STATE_MAX_AGE_S,
  });
  return c.redirect(buildServiceAuthorizeUrl(state));
});

/** Admin: service OAuth callback — store the shared account's encrypted refresh token. */
spotify.get("/service/callback", requireAdmin, async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");
  const error = c.req.query("error");
  const expected = getCookie(c, SERVICE_STATE_COOKIE);
  deleteCookie(c, SERVICE_STATE_COOKIE, { path: "/" });

  if (error) return c.json({ connected: false, error }, 400);
  if (!code || !state || !expected || state !== expected) {
    return c.json({ connected: false, error: "invalid_state" }, 400);
  }
  try {
    await connectServiceAccount(code);
    return c.json({ connected: true });
  } catch (e) {
    logger.error("Service account callback failed", e);
    return c.json({ connected: false, error: "exchange_failed" }, 500);
  }
});

export { spotify as spotifyRoutes };
