/**
 * Web-DJ live control channel (Track D).
 *
 * The browser drives the server-side Spotify poller over REST (it does NOT hold a DJ
 * WebSocket — the cloud is the broadcaster). All routes require an authenticated, approved
 * DJ. State-changing routes also require the X-Pika-Client CSRF header (applied in index.ts).
 *
 *   POST /api/live/start        → start sharing (needs an active Spotify connection) → { sessionId }
 *   POST /api/live/stop         → stop sharing + end the session
 *   POST /api/live/share        → { paused: boolean } — toggle manual "pause sharing"
 *   POST /api/live/announcement → { message, durationSeconds?, push? } — broadcast an announcement
 *   POST /api/live/poll/start   → { question, options, durationSeconds? } → { pollId }
 *   POST /api/live/poll/end     → end the session's active poll
 *   GET  /api/live/status       → { live, sessionId?, paused?, spotify, activePoll, tempo }
 *
 * The engagement endpoints (announcement/poll) reuse the same fan-out the desktop DJ's WS
 * handlers call (lib/announcements, lib/polls), publishing through the shared server
 * broadcaster since the web DJ holds no socket of its own.
 */

import { logger, SendAnnouncementSchema, StartPollSchema } from "@pika/shared";
import { Hono } from "hono";
import { announceToSession } from "../lib/announcements";
import { getUser, requireDjAuth } from "../lib/auth";
import { getBroadcaster } from "../lib/broadcaster";
import { endPollForSession, getSessionPoll, startPollForSession } from "../lib/polls";
import { getConnectionStatus } from "../lib/services/spotify";
import {
  getPollerStatus,
  setManualPause,
  startPoller,
  stopPoller,
} from "../lib/services/spotifyPoller";
import { getTempoFeedback } from "../lib/tempo";

const live = new Hono();

live.use("*", requireDjAuth);

/** REST body shapes — the WS schemas minus the transport-only fields (sessionId comes from the poller). */
const AnnouncementBody = SendAnnouncementSchema.pick({
  message: true,
  durationSeconds: true,
  push: true,
});
const StartPollBody = StartPollSchema.pick({
  question: true,
  options: true,
  durationSeconds: true,
});

/** The web DJ has no socket — fan out via the shared server broadcaster (reaches every subscriber). */
function broadcasterPublish(topic: string, data: string): void {
  getBroadcaster()?.publish(topic, data);
}

/** Resolve the caller's live session, or `null` if they aren't broadcasting. */
function liveSessionId(djUserId: string): string | null {
  const poller = getPollerStatus(djUserId);
  return poller.live && poller.sessionId ? poller.sessionId : null;
}

/** Start broadcasting the DJ's Spotify now-playing. */
live.post("/start", async (c) => {
  const dj = getUser(c);

  const spotify = await getConnectionStatus(dj.id);
  if (!spotify.connected) {
    return c.json({ error: "Connect Spotify first", needsConnect: true }, 409);
  }
  if (spotify.status === "needs_reauth") {
    return c.json({ error: "Reconnect Spotify", needsReauth: true }, 409);
  }

  try {
    const { sessionId } = await startPoller(dj.id, dj.name);
    return c.json({ success: true, sessionId });
  } catch (e) {
    logger.error("Failed to start live poller", e);
    return c.json({ error: "Failed to go live" }, 500);
  }
});

/** Stop broadcasting and end the session. */
live.post("/stop", async (c) => {
  await stopPoller(getUser(c).id, "dj-stopped");
  return c.json({ success: true });
});

/** Toggle manual pause (session stays live; nothing is broadcast while paused). */
live.post("/share", async (c) => {
  const dj = getUser(c);
  const body = (await c.req.json().catch(() => ({}))) as { paused?: unknown };
  if (typeof body.paused !== "boolean") {
    return c.json({ error: "Body must be { paused: boolean }" }, 400);
  }
  if (!setManualPause(dj.id, body.paused)) {
    return c.json({ error: "Not currently live", live: false }, 409);
  }
  return c.json({ success: true, paused: body.paused });
});

/** Broadcast a transient announcement (optionally with a mobile push) to the DJ's floor. */
live.post("/announcement", async (c) => {
  const sessionId = liveSessionId(getUser(c).id);
  if (!sessionId) return c.json({ error: "Not currently live", live: false }, 409);

  const parsed = AnnouncementBody.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json({ error: "Invalid announcement", issues: parsed.error.issues }, 400);
  }

  const sent = announceToSession(sessionId, parsed.data, broadcasterPublish);
  if (!sent) return c.json({ error: "Session not found", live: false }, 409);
  return c.json({ success: true });
});

/** Start a live poll on the DJ's session. */
live.post("/poll/start", async (c) => {
  const sessionId = liveSessionId(getUser(c).id);
  if (!sessionId) return c.json({ error: "Not currently live", live: false }, 409);

  const parsed = StartPollBody.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json({ error: "Invalid poll", issues: parsed.error.issues }, 400);
  }

  const result = await startPollForSession({ sessionId, ...parsed.data }, broadcasterPublish);
  if (!result.ok) {
    const code = result.error?.includes("already active")
      ? 409
      : result.error?.includes("database")
        ? 500
        : 400;
    return c.json({ error: result.error }, code);
  }
  return c.json({ success: true, pollId: result.pollId });
});

/** End the active poll on the DJ's session (broadcasts results). */
live.post("/poll/end", async (c) => {
  const sessionId = liveSessionId(getUser(c).id);
  if (!sessionId) return c.json({ error: "Not currently live", live: false }, 409);

  const poll = getSessionPoll(sessionId);
  if (!poll) return c.json({ error: "No active poll" }, 409);

  endPollForSession(poll.id, broadcasterPublish);
  return c.json({ success: true });
});

/** Current live + Spotify-connection status for the web UI (incl. the active poll + tempo readout). */
live.get("/status", async (c) => {
  const dj = getUser(c);
  const [poller, spotify] = await Promise.all([
    Promise.resolve(getPollerStatus(dj.id)),
    getConnectionStatus(dj.id),
  ]);

  // Surface the active poll + tempo so the DJ controls render off the single status poll
  // (the embedded LivePlayer still renders the live results/banner via its own listener).
  let activePoll: {
    pollId: number;
    question: string;
    options: string[];
    votes: number[];
    totalVotes: number;
    endsAt: string | null;
  } | null = null;
  let tempo: ReturnType<typeof getTempoFeedback> | null = null;

  if (poller.sessionId) {
    const p = getSessionPoll(poller.sessionId);
    if (p) {
      activePoll = {
        pollId: p.id,
        question: p.question,
        options: p.options,
        votes: p.votes,
        totalVotes: p.votes.reduce((a, b) => a + b, 0),
        endsAt: p.endsAt?.toISOString() ?? null,
      };
    }
    tempo = getTempoFeedback(poller.sessionId);
  }

  return c.json({ ...poller, spotify, activePoll, tempo });
});

export { live as djLiveRoutes };
