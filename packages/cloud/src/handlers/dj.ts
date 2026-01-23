/**
 * DJ Message Handlers
 *
 * Handles WebSocket messages from DJ clients:
 * - REGISTER_SESSION
 * - BROADCAST_TRACK
 * - TRACK_STOPPED
 * - END_SESSION
 * - SEND_ANNOUNCEMENT
 * - CANCEL_ANNOUNCEMENT
 *
 * @file packages/cloud/src/handlers/dj.ts
 * @package @pika/cloud
 * @created 2026-01-21
 */

import {
  PIKA_VERSION,
  RegisterSessionSchema,
  BroadcastTrackSchema,
  TrackStoppedSchema,
  EndSessionSchema,
  SendAnnouncementSchema,
  CancelAnnouncementSchema,
} from "@pika/shared";
import { setSession, getSession, deleteSession, type LiveSession } from "../lib/sessions";
import { persistSession, endSessionInDb, persistedSessions } from "../lib/persistence/sessions";
import { persistTrack, persistTempoVotes } from "../lib/persistence/tracks";
import { clearTempoVotes, getTempoFeedback } from "../lib/tempo";
import { logSessionEvent, sendAck, sendNack, parseMessage } from "../lib/protocol";
import { validateToken } from "../lib/auth";
import { checkAndRecordNonce } from "../lib/nonces";
import { clearLikesForSession } from "../lib/likes";
import { clearListeners } from "../lib/listeners";
import type { WSContext } from "./ws-context";

// 🛡️ Rate Limiting State
const lastBroadcastTime = new Map<string, number>();

/**
 * REGISTER_SESSION: DJ starts a new live session
 */
export async function handleRegisterSession(ctx: WSContext) {
  const { message, ws, rawWs, state, messageId } = ctx;

  console.log(`🔍 [REGISTER_SESSION] Handler invoked`, {
    hasMessage: !!message,
    messageType: (message as { type?: string })?.type,
    currentDjSessionId: state.djSessionId,
    messageId,
  });

  const msg = parseMessage(RegisterSessionSchema, message, ws, messageId);
  if (!msg) {
    console.error(`❌ [REGISTER_SESSION] Schema validation FAILED`);
    return;
  }

  const sessionId = msg.sessionId || `session_${Date.now()}`;
  const requestedDjName = msg.djName || "DJ";

  console.log(`🔍 [REGISTER_SESSION] Parsed`, { sessionId, requestedDjName, hasToken: !!msg.token });

  // 🔐 Token validation for DJ authentication
  const djToken = msg.token;
  let djUserId: number | null = null;
  let djName = requestedDjName;

  if (djToken) {
    const djUser = await validateToken(djToken);
    if (djUser) {
      djUserId = djUser.id;
      djName = djUser.displayName; // Use registered name
      console.log(`🔐 Authenticated DJ: ${djName} (ID: ${djUserId})`);
    } else {
      console.log(`⚠️ Invalid token provided, using anonymous mode`);
    }
  }

  const session: LiveSession = {
    sessionId,
    djName,
    startedAt: new Date().toISOString(),
  };

  // 🔧 CRITICAL FIX: Set state.djSessionId BEFORE any async operations
  // This ensures cleanup happens even if disconnect occurs during DB persist
  state.djSessionId = sessionId;
  console.log(`🔍 [REGISTER_SESSION] state.djSessionId SET to: ${sessionId}`);

  setSession(sessionId, session);
  console.log(
    `🎧 DJ going live: ${djName} (${sessionId})${djUserId ? ` [Verified]` : ` [Anonymous]`}`,
  );

  // 💾 Persist to database (async, but state is already set for cleanup)
  await persistSession(sessionId, djName, djUserId);
  console.log(`✅ Session ready for polls: ${sessionId}`);

  // Confirm registration to the client
  ws.send(
    JSON.stringify({
      type: "SESSION_REGISTERED",
      sessionId,
      authenticated: !!djUserId,
      djName,
    }),
  );

  if (messageId) sendAck(ws, messageId);

  // Broadcast to all subscribers
  rawWs.publish(
    "live-session",
    JSON.stringify({
      type: "SESSION_STARTED",
      sessionId,
      djName,
    }),
  );

  // 📊 Telemetry: Log DJ connect event
  logSessionEvent(sessionId, "connect", { clientVersion: PIKA_VERSION });
}

/**
 * BROADCAST_TRACK: DJ updates the currently playing track
 */
export async function handleBroadcastTrack(ctx: WSContext) {
  const { message, ws, rawWs, state, messageId } = ctx;
  const msg = parseMessage(BroadcastTrackSchema, message, ws, messageId);
  if (!msg) return;

  // 🔐 Security: Verify this connection owns the session
  if (state.djSessionId !== msg.sessionId) {
    console.warn(
      `⚠️ Unauthorized broadcast attempt: connection owns ${state.djSessionId || "none"}, tried to broadcast to ${msg.sessionId}`,
    );
    return;
  }

  // 🛡️ Rate Limiting: 1 track per 5 seconds
  const lastTime = lastBroadcastTime.get(msg.sessionId) || 0;
  const now = Date.now();
  if (now - lastTime < 5000) {
    console.warn(`⏳ Rate limit: Dropping broadcast for ${msg.sessionId} (too fast)`);
    if (messageId) sendNack(ws, messageId, "Rate limit exceeded (wait 5s)");
    return;
  }
  lastBroadcastTime.set(msg.sessionId, now);

  // 🔐 Security: Nonce deduplication
  if (!checkAndRecordNonce(messageId, msg.sessionId)) {
    console.log(`🔄 Skipping duplicate BROADCAST_TRACK (messageId: ${messageId})`);
    if (messageId) sendAck(ws, messageId);
    return;
  }

  const session = getSession(msg.sessionId);
  if (session) {
    // 🎚️ Persist tempo votes for the PREVIOUS track (if any)
    if (session.currentTrack) {
      const prevTrack = session.currentTrack;
      const isNewTrack =
        prevTrack.artist !== msg.track.artist || prevTrack.title !== msg.track.title;

      if (isNewTrack) {
        const feedback = getTempoFeedback(msg.sessionId);
        if (feedback.total > 0) {
          persistTempoVotes(msg.sessionId, prevTrack, {
            slower: feedback.slower,
            perfect: feedback.perfect,
            faster: feedback.faster,
          });
        }

        // Clear tempo votes for this session
        clearTempoVotes(msg.sessionId);

        // Broadcast to all clients to reset their tempo vote UI
        rawWs.publish(
          "live-session",
          JSON.stringify({
            type: "TEMPO_RESET",
            sessionId: msg.sessionId,
          }),
        );
      }
    }

    session.currentTrack = msg.track;
    console.log(`🎵 Now playing: ${msg.track.artist} - ${msg.track.title}`);

    // 💾 Persist to database
    try {
      await persistTrack(msg.sessionId, msg.track);
    } catch (err) {
      console.error(`❌ DB Error: Failed to persist track for ${msg.sessionId}`, err);
    }

    // Broadcast to all subscribers
    rawWs.publish(
      "live-session",
      JSON.stringify({
        type: "NOW_PLAYING",
        sessionId: msg.sessionId,
        djName: session.djName || "DJ",
        track: msg.track,
      }),
    );
    if (messageId) sendAck(ws, messageId);
  } else {
    if (messageId) sendNack(ws, messageId, "Session not found");
  }
}

/**
 * TRACK_STOPPED: DJ manually stops a track
 */
export function handleTrackStopped(ctx: WSContext) {
  const { message, ws, rawWs, state, messageId } = ctx;
  const msg = parseMessage(TrackStoppedSchema, message, ws, messageId);
  if (!msg) return;

  // 🔐 Security: Verify this connection owns the session
  if (state.djSessionId !== msg.sessionId) {
    console.warn(
      `⚠️ Unauthorized track stop attempt: connection owns ${state.djSessionId || "none"}, tried to stop track for ${msg.sessionId}`,
    );
    if (messageId) sendNack(ws, messageId, "Unauthorized track stop");
    return;
  }

  const session = getSession(msg.sessionId);
  if (session) {
    delete session.currentTrack;
    console.log(`⏸️ Track stopped for session: ${msg.sessionId}`);

    rawWs.publish(
      "live-session",
      JSON.stringify({
        type: "TRACK_STOPPED",
        sessionId: msg.sessionId,
      }),
    );
    if (messageId) sendAck(ws, messageId);
  } else {
    if (messageId) sendNack(ws, messageId, "Session not found");
  }
}

/**
 * END_SESSION: DJ ends the live session
 */
export function handleEndSession(ctx: WSContext) {
  const { message, ws, rawWs, state, messageId } = ctx;
  const msg = parseMessage(EndSessionSchema, message, ws, messageId);
  if (!msg) return;

  // 🔐 Security: Verify this connection owns the session
  if (state.djSessionId !== msg.sessionId) {
    console.warn(
      `⚠️ Unauthorized end session attempt: connection owns ${state.djSessionId || "none"}, tried to end ${msg.sessionId}`,
    );
    if (messageId) sendNack(ws, messageId, "Unauthorized end session");
    return;
  }

  const session = getSession(msg.sessionId);
  if (session) {
    console.log(`👋 Session ended: ${session.djName}`);

    // 🎚️ Persist tempo votes for the LAST track (if any)
    if (session.currentTrack) {
      const feedback = getTempoFeedback(msg.sessionId);
      if (feedback.total > 0) {
        console.log(`🎚️ Persisting final tempo votes: ${JSON.stringify(feedback)}`);
        persistTempoVotes(msg.sessionId, session.currentTrack, {
          slower: feedback.slower,
          perfect: feedback.perfect,
          faster: feedback.faster,
        });
      }
      clearTempoVotes(msg.sessionId);
    }

    deleteSession(msg.sessionId);

    // 💾 Update in database
    endSessionInDb(msg.sessionId);

    // 🧹 Clean up all in-memory state
    clearLikesForSession(msg.sessionId);
    clearListeners(msg.sessionId);
    persistedSessions.delete(msg.sessionId);
    lastBroadcastTime.delete(msg.sessionId);

    rawWs.publish(
      "live-session",
      JSON.stringify({
        type: "SESSION_ENDED",
        sessionId: msg.sessionId,
      }),
    );
    if (messageId) sendAck(ws, messageId);
  } else {
    if (messageId) sendNack(ws, messageId, "Session not found");
  }
}

/**
 * SEND_ANNOUNCEMENT: DJ sends a transient announcement
 */
export function handleSendAnnouncement(ctx: WSContext) {
  const { message, ws, rawWs, state, messageId } = ctx;
  const msg = parseMessage(SendAnnouncementSchema, message, ws, messageId);
  if (!msg) return;

  const { sessionId: announcementSessionId, message: announcementMessage, durationSeconds } = msg;

  const djSession = getSession(announcementSessionId);
  if (!djSession) {
    console.log(`⚠️ Announcement rejected: session ${announcementSessionId} not found`);
    if (messageId) sendNack(ws, messageId, "Session not found");
    return;
  }

  // 🔐 Security: Verify this connection owns the session
  if (state.djSessionId !== announcementSessionId) {
    console.warn(
      `⚠️ Unauthorized announcement attempt: connection owns ${state.djSessionId || "none"}, tried to announce to ${announcementSessionId}`,
    );
    if (messageId) sendNack(ws, messageId, "Unauthorized announcement");
    return;
  }

  const timestamp = new Date().toISOString();
  const endsAt = durationSeconds
    ? new Date(Date.now() + durationSeconds * 1000).toISOString()
    : undefined;

  djSession.activeAnnouncement = {
    message: announcementMessage,
    timestamp,
    ...(endsAt && { endsAt }),
  };

  rawWs.publish(
    "live-session",
    JSON.stringify({
      type: "ANNOUNCEMENT_RECEIVED",
      sessionId: announcementSessionId,
      message: announcementMessage,
      djName: djSession.djName,
      timestamp,
      endsAt,
    }),
  );

  console.log(
    `📢 Announcement from ${djSession.djName}: "${announcementMessage}"${durationSeconds ? ` (${durationSeconds}s timer)` : ""}`,
  );
  if (messageId) sendAck(ws, messageId);
}

/**
 * CANCEL_ANNOUNCEMENT: DJ cancels a transient announcement
 */
export function handleCancelAnnouncement(ctx: WSContext) {
  const { message, ws, rawWs, state, messageId } = ctx;
  const msg = parseMessage(CancelAnnouncementSchema, message, ws, messageId);
  if (!msg) return;

  const { sessionId: cancelSessionId } = msg;

  const session = getSession(cancelSessionId);
  if (!session) {
    console.log(`⚠️ Cancel announcement rejected: session ${cancelSessionId} not found`);
    if (messageId) sendNack(ws, messageId, "Session not found");
    return;
  }

  // 🔐 Security: Verify this connection owns the session
  if (state.djSessionId !== cancelSessionId) {
    console.warn(
      `⚠️ Unauthorized cancel announcement attempt: connection owns ${state.djSessionId || "none"}, tried to cancel for ${cancelSessionId}`,
    );
    if (messageId) sendNack(ws, messageId, "Unauthorized cancel announcement");
    return;
  }

  session.activeAnnouncement = null;

  rawWs.publish(
    "live-session",
    JSON.stringify({
      type: "ANNOUNCEMENT_CANCELLED",
      sessionId: cancelSessionId,
    }),
  );

  console.log(`📢❌ Announcement cancelled for session ${cancelSessionId}`);
  if (messageId) sendAck(ws, messageId);
}
