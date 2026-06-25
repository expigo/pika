/**
 * Web-DJ live control channel (Track D).
 *
 * The browser drives the server-side Spotify poller over REST (it does NOT hold a DJ
 * WebSocket — the cloud is the broadcaster). All routes require an authenticated, approved
 * DJ. State-changing routes also require the X-Pika-Client CSRF header (applied in index.ts).
 *
 *   POST /api/live/start   → start sharing (needs an active Spotify connection) → { sessionId }
 *   POST /api/live/stop    → stop sharing + end the session
 *   POST /api/live/share   → { paused: boolean } — toggle manual "pause sharing"
 *   GET  /api/live/status  → { live, sessionId?, paused?, spotify }
 */

import { logger } from "@pika/shared";
import { Hono } from "hono";
import { getDjUser, requireDjAuth } from "../lib/auth";
import { getConnectionStatus } from "../lib/services/spotify";
import {
  getPollerStatus,
  setManualPause,
  startPoller,
  stopPoller,
} from "../lib/services/spotifyPoller";

const live = new Hono();

live.use("*", requireDjAuth);

/** Start broadcasting the DJ's Spotify now-playing. */
live.post("/start", async (c) => {
  const dj = getDjUser(c);

  const spotify = await getConnectionStatus(dj.id);
  if (!spotify.connected) {
    return c.json({ error: "Connect Spotify first", needsConnect: true }, 409);
  }
  if (spotify.status === "needs_reauth") {
    return c.json({ error: "Reconnect Spotify", needsReauth: true }, 409);
  }

  try {
    const { sessionId } = await startPoller(dj.id, dj.displayName);
    return c.json({ success: true, sessionId });
  } catch (e) {
    logger.error("Failed to start live poller", e);
    return c.json({ error: "Failed to go live" }, 500);
  }
});

/** Stop broadcasting and end the session. */
live.post("/stop", async (c) => {
  await stopPoller(getDjUser(c).id, "dj-stopped");
  return c.json({ success: true });
});

/** Toggle manual pause (session stays live; nothing is broadcast while paused). */
live.post("/share", async (c) => {
  const dj = getDjUser(c);
  const body = (await c.req.json().catch(() => ({}))) as { paused?: unknown };
  if (typeof body.paused !== "boolean") {
    return c.json({ error: "Body must be { paused: boolean }" }, 400);
  }
  if (!setManualPause(dj.id, body.paused)) {
    return c.json({ error: "Not currently live", live: false }, 409);
  }
  return c.json({ success: true, paused: body.paused });
});

/** Current live + Spotify-connection status for the web UI. */
live.get("/status", async (c) => {
  const dj = getDjUser(c);
  const [poller, spotify] = await Promise.all([
    Promise.resolve(getPollerStatus(dj.id)),
    getConnectionStatus(dj.id),
  ]);
  return c.json({ ...poller, spotify });
});

export { live as djLiveRoutes };
