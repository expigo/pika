/**
 * Connection Lifecycle Handlers
 *
 * Handles opening and closing of WebSocket connections.
 *
 * @file packages/cloud/src/handlers/lifecycle.ts
 * @package @pika/cloud
 * @created 2026-01-21
 */

import { logger } from "@pika/shared";
import type { ServerWebSocket } from "bun";
import { getBroadcaster } from "../lib/broadcaster";
import { clearLikesForSession } from "../lib/likes";
import { clearListeners, getListenerCount, removeListener } from "../lib/listeners";
import { cleanupSessionQueue } from "../lib/persistence/queue";
import { endSessionInDb, persistedSessions } from "../lib/persistence/sessions";
import { clearLastPersistedTrackKey, persistTempoVotes } from "../lib/persistence/tracks";
import { clearSessionPolls } from "../lib/polls";
import { logSessionEvent } from "../lib/protocol";
import { deleteSession, getSession, scheduleDjReap } from "../lib/sessions";
import { clearStageActiveSession } from "../lib/stages";
import { clearTempoVotes, getTempoFeedback } from "../lib/tempo";
import { DISCOVERY_TOPIC, getStageTopic } from "../lib/topics";
import { lastBroadcastTime } from "./dj";
import type { WSConnectionState } from "./ws-context";

// Grace window after a DJ socket drops before the session is actually ended.
// The desktop WebView drops `ws://localhost` periodically and reconnects within
// ~1s; deferring teardown keeps the session live and invisible to dancers.
// A genuine departure (app closed) ends the session after this delay.
// Overridable via env for ops tuning / tests.
const DJ_RECONNECT_GRACE_MS = Number(process.env["DJ_RECONNECT_GRACE_MS"] ?? 45_000);

/**
 * Handle new WebSocket connection
 */
export function handleOpen(rawWs: ServerWebSocket) {
  logger.debug("🔌 Client connected");

  // Subscribe every client to the global discovery ("lobby") topic. This carries
  // only rare lifecycle events (session started/ended/expired, shutdown).
  // High-frequency session traffic flows over per-session topics instead, which
  // clients join via SUBSCRIBE (dancers) or REGISTER_SESSION (DJs).
  rawWs.subscribe(DISCOVERY_TOPIC);
}

/**
 * Tear down a session for good: persist final state, free in-memory state, and
 * tell everyone it ended. Called when the DJ-reconnect grace window expires
 * (the DJ did not come back) — by then the DJ's socket is gone, so the
 * SESSION_ENDED broadcast goes through the shared server broadcaster.
 */
export function reapSession(sessionId: string): void {
  const session = getSession(sessionId);
  if (!session) return; // already gone (reconnected, or ended explicitly)

  logger.info(`👋 Session ended (DJ did not reconnect): ${session.djName} (${sessionId})`);

  // Persist final tempo votes if a track was playing
  if (session.currentTrack) {
    const feedback = getTempoFeedback(sessionId);
    if (feedback.total > 0) {
      logger.debug("🎚️ Persisting final tempo votes", { feedback });
      persistTempoVotes(sessionId, session.currentTrack, {
        slower: feedback.slower,
        perfect: feedback.perfect,
        faster: feedback.faster,
      });
    }
    clearTempoVotes(sessionId);
  }

  const reapedStageId = session.stageId;

  deleteSession(sessionId);
  if (reapedStageId) clearStageActiveSession(reapedStageId, sessionId);
  endSessionInDb(sessionId).catch((e) => logger.error("❌ Failed to end session in DB", e));
  clearLikesForSession(sessionId);
  // Stage listeners persist across rotation; only a stage-less session clears them.
  if (!reapedStageId) clearListeners(sessionId);
  persistedSessions.delete(sessionId);
  lastBroadcastTime.delete(sessionId);
  cleanupSessionQueue(sessionId);
  clearLastPersistedTrackKey(sessionId);
  clearSessionPolls(sessionId);

  // Broadcast on the discovery topic so in-session dancers and lobby browsers
  // learn the session is over. The DJ socket is gone, so use server.publish.
  getBroadcaster()?.publish(
    DISCOVERY_TOPIC,
    JSON.stringify({
      type: "SESSION_ENDED",
      sessionId,
      ...(reapedStageId && { stageId: reapedStageId }), // stage-mode dancers show "waiting", not "over"
    }),
  );

  logSessionEvent(sessionId, "disconnect", { reason: "grace-expired" }).catch((e) =>
    logger.error("❌ Telemetry failed", e),
  );
}

/**
 * Handle WebSocket disconnection
 */
export function handleClose(_ws: { raw: unknown }, state: WSConnectionState) {
  const { djSessionId, isListener, clientId, subscribedSessionId, subscribedStageId } = state;

  logger.debug("🔍 [CLOSE] Client disconnected", {
    djSessionId: djSessionId || "NONE",
    isListener,
    clientId: clientId || "NONE",
    subscribedSessionId: subscribedSessionId || "NONE",
    subscribedStageId: subscribedStageId || "NONE",
  });

  // DJ connection dropped: DON'T end the session immediately. The desktop WebView
  // drops `ws://localhost` periodically and reconnects within ~1s; tearing down
  // on every blip made dancers see SESSION_ENDED → SESSION_STARTED churn and the
  // listener count flicker. Defer teardown — a reconnect (handleRegisterSession)
  // cancels it; only a genuine departure (grace expires) ends the session.
  if (djSessionId) {
    const session = getSession(djSessionId);
    if (session) {
      logger.warn(
        `⚠️ DJ disconnected: ${session.djName} (${djSessionId}) — ${DJ_RECONNECT_GRACE_MS}ms grace before teardown`,
      );
      scheduleDjReap(djSessionId, DJ_RECONNECT_GRACE_MS, () => reapSession(djSessionId));
    } else {
      // Session already gone (e.g. explicit End Set already tore it down).
      logger.debug(`🔍 [CLOSE] DJ ${djSessionId} had no live session (already ended)`);
    }
  } else {
    logger.debug("🔍 [CLOSE] Not a DJ connection (no djSessionId in state)");
  }

  // Remove listener from its audience (dancers leave immediately; only the DJ
  // gets a grace window). The audience key is the stage when on a stage, else
  // the session — matching how the listener was counted on join.
  if (isListener && clientId && (subscribedStageId || subscribedSessionId)) {
    const audienceKey = subscribedStageId
      ? getStageTopic(subscribedStageId)
      : (subscribedSessionId as string);
    const wasRemoved = removeListener(audienceKey, clientId);

    // Only update the count; the 2-second heartbeat will handle the broadcast
    if (wasRemoved) {
      getListenerCount(audienceKey);
    }
  }
}
