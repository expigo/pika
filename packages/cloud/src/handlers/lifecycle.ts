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
import { clearLikesForSession } from "../lib/likes";
import { clearListeners, getListenerCount, removeListener } from "../lib/listeners";
import { cleanupSessionQueue } from "../lib/persistence/queue";
import { endSessionInDb, persistedSessions } from "../lib/persistence/sessions";
import { clearLastPersistedTrackKey, persistTempoVotes } from "../lib/persistence/tracks";
import { clearSessionPolls } from "../lib/polls";
import { logSessionEvent } from "../lib/protocol";
import { deleteSession, getSession } from "../lib/sessions";
import { clearTempoVotes, getTempoFeedback } from "../lib/tempo";
import { lastBroadcastTime } from "./dj";
import { checkBackpressure } from "./utility";
import type { WSConnectionState } from "./ws-context";

/**
 * Handle new WebSocket connection
 */
export function handleOpen(rawWs: ServerWebSocket) {
  logger.debug("🔌 Client connected");

  // Subscribe all clients to the live-session channel
  rawWs.subscribe("live-session");
}

/**
 * Handle WebSocket disconnection
 */
export function handleClose(ws: { raw: unknown }, state: WSConnectionState) {
  const { djSessionId, isListener, clientId, subscribedSessionId } = state;

  logger.debug("🔍 [CLOSE] Client disconnected", {
    djSessionId: djSessionId || "NONE",
    isListener,
    clientId: clientId || "NONE",
    subscribedSessionId: subscribedSessionId || "NONE",
  });

  // End DJ session if this was a DJ connection
  if (djSessionId) {
    const session = getSession(djSessionId);
    logger.debug("🔍 [CLOSE] DJ session lookup", {
      djSessionId,
      sessionFound: !!session,
      sessionDjName: session?.djName,
    });

    if (session) {
      logger.warn(`⚠️ DJ disconnected unexpectedly: ${session.djName} (${djSessionId})`);

      // Persist final tempo votes if track was playing
      if (session.currentTrack) {
        const feedback = getTempoFeedback(djSessionId);
        if (feedback.total > 0) {
          logger.debug("🎚️ Persisting final tempo votes", { feedback });
          persistTempoVotes(djSessionId, session.currentTrack, {
            slower: feedback.slower,
            perfect: feedback.perfect,
            faster: feedback.faster,
          });
        }
        clearTempoVotes(djSessionId);
      }

      deleteSession(djSessionId);
      logger.debug(`🔍 [CLOSE] Session deleted from memory: ${djSessionId}`);

      endSessionInDb(djSessionId).catch((e) => logger.error("❌ Failed to end session in DB", e));
      clearLikesForSession(djSessionId);
      clearListeners(djSessionId);
      persistedSessions.delete(djSessionId);
      cleanupSessionQueue(djSessionId);
      clearLastPersistedTrackKey(djSessionId);

      // Broadcast session ended to all listeners
      const rawWs = ws.raw as ServerWebSocket;
      if (checkBackpressure(rawWs, clientId || undefined)) {
        rawWs.publish(
          "live-session",
          JSON.stringify({
            type: "SESSION_ENDED",
            sessionId: djSessionId,
          }),
        );
      }

      // 📊 Telemetry: Log DJ disconnect event
      logSessionEvent(djSessionId, "disconnect", { reason: "unexpected" }).catch((e) =>
        logger.error("❌ Telemetry failed", e),
      );

      logger.info(`👋 Session auto-ended: ${session.djName}`);
    } else {
      logger.warn(
        `⚠️ [CLOSE] DJ had sessionId ${djSessionId} but session not found in memory - possible zombie!`,
      );
    }

    // 🧹 M1 & M4 Fix: Ensure Map cleanup happens even if session was deleted
    if (lastBroadcastTime.has(djSessionId)) {
      lastBroadcastTime.delete(djSessionId);
      logger.debug(`🧹 [M1] Cleared lastBroadcastTime for ${djSessionId}`);
    }
    clearSessionPolls(djSessionId);
  } else {
    logger.debug("🔍 [CLOSE] Not a DJ connection (no djSessionId in state)");
  }

  // Remove listener from session if this was a listener
  if (isListener && clientId && subscribedSessionId) {
    const wasRemoved = removeListener(subscribedSessionId, clientId);

    // Only update the count; the 2-second heartbeat will handle the broadcast
    if (wasRemoved) {
      getListenerCount(subscribedSessionId);
    }
  }
}
