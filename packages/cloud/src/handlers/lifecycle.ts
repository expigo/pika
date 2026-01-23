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
import { getSession, deleteSession } from "../lib/sessions";
import { removeListener, getListenerCount, clearListeners } from "../lib/listeners";
import { endSessionInDb, persistedSessions } from "../lib/persistence/sessions";
import { persistTempoVotes } from "../lib/persistence/tracks";
import { lastBroadcastTime } from "./dj";
import { clearSessionPolls } from "../lib/polls";
import { clearTempoVotes, getTempoFeedback } from "../lib/tempo";
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
  const { djSessionId, isListener, clientId, subscribedSessionId } = state;

  console.log(`🔍 [CLOSE] Client disconnected`, {
    djSessionId: djSessionId || "NONE",
    isListener,
    clientId: clientId || "NONE",
    subscribedSessionId: subscribedSessionId || "NONE",
  });

  // End DJ session if this was a DJ connection
  if (djSessionId) {
    const session = getSession(djSessionId);
    console.log(`🔍 [CLOSE] DJ session lookup`, {
      djSessionId,
      sessionFound: !!session,
      sessionDjName: session?.djName,
    });

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
        clearTempoVotes(djSessionId);
      }

      deleteSession(djSessionId);
      console.log(`🔍 [CLOSE] Session deleted from memory: ${djSessionId}`);

      endSessionInDb(djSessionId);
      clearLikesForSession(djSessionId);
      clearListeners(djSessionId);
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
    } else {
      console.warn(
        `⚠️ [CLOSE] DJ had sessionId ${djSessionId} but session not found in memory - possible zombie!`,
      );
    }

    // 🧹 M1 & M4 Fix: Ensure Map cleanup happens even if session was deleted
    if (lastBroadcastTime.has(djSessionId)) {
      lastBroadcastTime.delete(djSessionId);
      console.log(`🧹 [M1] Cleared lastBroadcastTime for ${djSessionId}`);
    }
    clearSessionPolls(djSessionId);
  } else {
    console.log(`🔍 [CLOSE] Not a DJ connection (no djSessionId in state)`);
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
