/**
 * Connection Lifecycle Handlers
 *
 * Handles opening and closing of WebSocket connections.
 *
 * @file packages/cloud/src/handlers/lifecycle.ts
 * @package @pika/cloud
 * @created 2026-01-21
 */

import type { ServerWebSocket } from "bun";
import { activeSessions } from "../lib/sessions";
import { removeListener, getListenerCount, sessionListeners } from "../lib/listeners";
import { endSessionInDb, persistedSessions } from "../lib/persistence/sessions";
import { persistTempoVotes } from "../lib/persistence/tracks";
import { tempoVotes, getTempoFeedback } from "../lib/tempo";
import { clearLikesForSession } from "../lib/likes";
import { logSessionEvent } from "../lib/protocol";
import type { WSConnectionState } from "./ws-context";

/**
 * Handle new WebSocket connection
 */
export function handleOpen(rawWs: ServerWebSocket) {
  console.log("🔌 Client connected");

  // Subscribe all clients to the live-session channel
  rawWs.subscribe("live-session");
}

/**
 * Handle WebSocket disconnection
 */
export function handleClose(ws: { raw: unknown }, state: WSConnectionState) {
  console.log("❌ Client disconnected");
  const { djSessionId, isListener, clientId, subscribedSessionId } = state;

  // End DJ session if this was a DJ connection
  if (djSessionId) {
    const session = activeSessions.get(djSessionId);
    if (session) {
      console.log(`⚠️ DJ disconnected unexpectedly: ${session.djName} (${djSessionId})`);

      // Persist final tempo votes if track was playing
      if (session.currentTrack) {
        const feedback = getTempoFeedback(djSessionId);
        if (feedback.total > 0) {
          console.log(`🎚️ Persisting final tempo votes: ${JSON.stringify(feedback)}`);
          persistTempoVotes(djSessionId, session.currentTrack, {
            slower: feedback.slower,
            perfect: feedback.perfect,
            faster: feedback.faster,
          });
        }
        tempoVotes.delete(djSessionId);
      }

      activeSessions.delete(djSessionId);
      endSessionInDb(djSessionId);
      clearLikesForSession(djSessionId);
      sessionListeners.delete(djSessionId);
      persistedSessions.delete(djSessionId);

      // Broadcast session ended to all listeners
      const rawWs = ws.raw as ServerWebSocket;
      rawWs.publish(
        "live-session",
        JSON.stringify({
          type: "SESSION_ENDED",
          sessionId: djSessionId,
        }),
      );

      // 📊 Telemetry: Log DJ disconnect event
      logSessionEvent(djSessionId, "disconnect", { reason: "unexpected" });

      console.log(`👋 Session auto-ended: ${session.djName}`);
    }
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
