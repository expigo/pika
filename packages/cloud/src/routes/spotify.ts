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
import { getUser, requireDjAuth } from "../lib/auth";
import { buildAuthorizeUrl, connectSpotify, getConnectionStatus } from "../lib/services/spotify";

const spotify = new Hono();

const OAUTH_STATE_COOKIE = "spotify_oauth_state";
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

export { spotify as spotifyRoutes };
