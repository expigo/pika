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
  TIMEOUTS,
  logger,
} from "@pika/shared";
import {
  setSession,
  getSession,
  deleteSession,
  updateSessionTrack,
  clearSessionTrack,
  setSessionAnnouncement,
  type LiveSession,
} from "../lib/sessions";
import { persistSession, endSessionInDb, persistedSessions } from "../lib/persistence/sessions";
import { persistTrack, persistTempoVotes } from "../lib/persistence/tracks";
import { clearTempoVotes, getTempoFeedback } from "../lib/tempo";
import { logSessionEvent, sendAck, sendNack, parseMessage } from "../lib/protocol";
import { validateToken } from "../lib/auth";
import { checkBackpressure } from "./utility";
import { checkAndRecordNonce } from "../lib/nonces";
import { clearLikesForSession } from "../lib/likes";
import { clearListeners } from "../lib/listeners";
import { cleanupSessionQueue } from "../lib/persistence/queue";
import { clearLastPersistedTrackKey } from "../lib/persistence/tracks";
import type { WSContext } from "./ws-context";
import { getSessionCount } from "../lib/sessions";
import { PushService } from "../services/push";
import { db } from "../db";
import { pushSubscriptions } from "../db/schema";
import { isNull, desc } from "drizzle-orm";

// 🛡️ Rate Limiting State
// Max 1000 concurrent sessions to prevent memory exhaustion (M5)
const MAX_CONCURRENT_SESSIONS = Number(process.env["MAX_SESSIONS"] ?? 1000);
export const lastBroadcastTime = new Map<string, number>();

/**
 * 🛡️ Issue 21 Fix: TTL Cleanup for rate-limit map
 * Removes entries older than 1 hour to prevent unbounded memory growth
 */
export function cleanupRateLimits() {
  const now = Date.now();
  const TTL = 60 * 60 * 1000; // 1 hour
  let count = 0;

  for (const [sessionId, lastTime] of lastBroadcastTime.entries()) {
    if (now - lastTime > TTL) {
      lastBroadcastTime.delete(sessionId);
      count++;
    }
  }

  if (count > 0) {
    logger.debug(`🧹 [CLEANUP] Removed ${count} stale rate-limit entries`);
  }
}

/**
 * REGISTER_SESSION: DJ starts a new live session
 */
export async function handleRegisterSession(ctx: WSContext) {
  const { message, ws, rawWs, state, messageId } = ctx;

  logger.debug("🔍 [REGISTER_SESSION] Handler invoked", {
    hasMessage: !!message,
    messageType: (message as { type?: string })?.type,
    currentDjSessionId: state.djSessionId,
    messageId,
  });

  const msg = parseMessage(RegisterSessionSchema, message, ws, messageId);
  if (!msg) {
    logger.warn("❌ [REGISTER_SESSION] Schema validation FAILED");
    return;
  }

  const sessionId = msg.sessionId || `session_${Date.now()}`;
  const requestedDjName = msg.djName || "DJ";

  // 🛡️ M5 Fix: Prevent unbounded session growth
  // Check limit BEFORE creating new session (unless it's a reconnect to existing)
  if (!getSession(sessionId) && getSessionCount() >= MAX_CONCURRENT_SESSIONS) {
    logger.warn("🛑 Session limit reached", { limit: MAX_CONCURRENT_SESSIONS, sessionId });
    ws.close(1013, "Server busy (max sessions reached)");
    return;
  }

  logger.debug("🔍 [REGISTER_SESSION] Parsed", {
    sessionId,
    requestedDjName,
    hasToken: !!msg.token,
  });

  // 🔐 Token validation for DJ authentication
  const djToken = msg.token;
  let djUserId: number | null = null;
  let djName = requestedDjName;

  if (djToken) {
    const djUser = await validateToken(djToken);
    if (djUser) {
      djUserId = djUser.id;
      djName = djUser.displayName; // Use registered name
      logger.info("🔐 Authenticated DJ", { djName, djUserId });
    } else {
      logger.warn("⚠️ Invalid token provided, using anonymous mode");
    }
  }

  const session: LiveSession = {
    sessionId,
    djName,
    startedAt: new Date().toISOString(),
    lastActivityAt: new Date().toISOString(),
  };

  // 🔧 CRITICAL FIX: Set state.djSessionId BEFORE any async operations
  // This ensures cleanup happens even if disconnect occurs during DB persist
  state.djSessionId = sessionId;
  logger.debug(`🔍 [REGISTER_SESSION] state.djSessionId SET to: ${sessionId}`);

  setSession(sessionId, session);
  logger.info("🎧 DJ going live", {
    djName,
    sessionId,
    mode: djUserId ? "Verified" : "Anonymous",
  });

  // 💾 Persist to database (async, but state is already set for cleanup)
  await persistSession(sessionId, djName, djUserId);
  logger.debug(`✅ Session ready for polls: ${sessionId}`);

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
  if (checkBackpressure(rawWs, state.clientId || undefined)) {
    rawWs.publish(
      "live-session",
      JSON.stringify({
        type: "SESSION_STARTED",
        sessionId,
        djName: session.djName,
        startTime: session.startedAt,
      }),
    );
  }

  // Log to telemetry (Fire-and-forget)
  logSessionEvent(sessionId, "connect", { clientVersion: msg.version || PIKA_VERSION }).catch((e) =>
    logger.error("❌ Telemetry failed", e),
  );
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
    logger.warn("⚠️ Unauthorized broadcast attempt", {
      owner: state.djSessionId || "none",
      target: msg.sessionId,
    });
    return;
  }

  // 🛡️ Rate Limiting: 1 track per 5 seconds
  const lastTime = lastBroadcastTime.get(msg.sessionId) || 0;
  const now = Date.now();
  if (now - lastTime < TIMEOUTS.MIN_BROADCAST_INTERVAL) {
    logger.warn(`⏳ Rate limit: Dropping broadcast for ${msg.sessionId} (too fast)`);
    if (messageId) sendNack(ws, messageId, "Rate limit exceeded (wait 5s)");
    return;
  }
  lastBroadcastTime.set(msg.sessionId, now);

  // 🔐 Security: Nonce deduplication
  if (!checkAndRecordNonce(messageId, msg.sessionId)) {
    logger.debug(`🔄 Skipping duplicate BROADCAST_TRACK`, { messageId });
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
        if (checkBackpressure(rawWs, state.clientId || undefined)) {
          rawWs.publish(
            "live-session",
            JSON.stringify({
              type: "TEMPO_RESET",
              sessionId: msg.sessionId,
            }),
          );
        }
      }
    }

    updateSessionTrack(msg.sessionId, msg.track);
    logger.info("🎵 Now playing", {
      artist: msg.track.artist,
      title: msg.track.title,
      sessionId: msg.sessionId,
    });

    // Broadcast new track to all connected clients
    if (checkBackpressure(rawWs, state.clientId || undefined)) {
      rawWs.publish(
        "live-session",
        JSON.stringify({
          type: "NOW_PLAYING",
          sessionId: msg.sessionId,
          djName: session.djName,
          track: msg.track,
        }),
      );
    }

    // 💾 Persist track (Fire-and-forget, handled by queue)
    persistTrack(msg.sessionId, msg.track).catch((err) => {
      logger.error(`❌ DB Error: Failed to persist track for ${msg.sessionId}`, err);
    });
    if (messageId) sendAck(ws, messageId);
  } else {
    if (messageId) sendNack(ws, messageId, "Session not found");
  }
}

/**
 * METADATA_UPDATED: DJ updates metadata for current track (BPM/Key)
 * Bypasses rate limit and does NOT reset likes.
 */
export async function handleBroadcastMetadata(ctx: WSContext) {
  const { message, ws, rawWs, state, messageId } = ctx;
  const { BroadcastMetadataSchema } = await import("@pika/shared");
  const msg = parseMessage(BroadcastMetadataSchema, message, ws, messageId);
  if (!msg) return;

  // 🔐 Security: Verify owner
  if (state.djSessionId !== msg.sessionId) {
    logger.warn("⚠️ Unauthorized metadata update attempt", {
      owner: state.djSessionId || "none",
      target: msg.sessionId,
    });
    return;
  }

  const session = getSession(msg.sessionId);
  if (session) {
    // ✅ FIX: Reject if no track is currently playing (Ghost Track Prevention)
    if (!session.currentTrack) {
      logger.warn("⚠️ Metadata update ignored: No track currently playing");
      if (messageId) sendAck(ws, messageId); // Still ACK to prevent retries
      return;
    }

    // Verify track matches current track (sanity check)
    // Only update if title/artist match, otherwise it's a race condition and should be ignored
    if (
      session.currentTrack.artist !== msg.track.artist ||
      session.currentTrack.title !== msg.track.title
    ) {
      logger.warn("⚠️ Metadata update ignored: Track mismatch", {
        current: `${session.currentTrack.artist} - ${session.currentTrack.title}`,
        update: `${msg.track.artist} - ${msg.track.title}`,
      });
      return;
    }

    // Update in-memory state
    updateSessionTrack(msg.sessionId, msg.track);
    logger.info("📝 Metadata updated (BPM/Key)", {
      sessionId: msg.sessionId,
      bpm: msg.track.bpm,
      key: msg.track.key,
    });

    // Broadcast update to all clients
    // Uses METADATA_UPDATED type which clients should handle by merging into current state
    if (checkBackpressure(rawWs, state.clientId || undefined)) {
      rawWs.publish(
        "live-session",
        JSON.stringify({
          type: "METADATA_UPDATED",
          sessionId: msg.sessionId,
          track: msg.track,
        }),
      );
    }

    // Persist updated track to DB (fire-and-forget)
    persistTrack(msg.sessionId, msg.track).catch((err) => {
      logger.error(`❌ DB Error: Failed to persist track update`, err);
    });

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
    logger.warn("⚠️ Unauthorized track stop attempt", {
      owner: state.djSessionId || "none",
      target: msg.sessionId,
    });
    if (messageId) sendNack(ws, messageId, "Unauthorized track stop");
    return;
  }

  const session = getSession(msg.sessionId);
  if (session) {
    // Clear track and refresh activity
    clearSessionTrack(msg.sessionId);
    logger.info(`⏸️ Track stopped for session: ${msg.sessionId}`);

    if (checkBackpressure(rawWs, state.clientId || undefined)) {
      rawWs.publish(
        "live-session",
        JSON.stringify({
          type: "TRACK_STOPPED",
          sessionId: msg.sessionId,
        }),
      );
    }
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
    logger.warn("⚠️ Unauthorized end session attempt", {
      owner: state.djSessionId || "none",
      target: msg.sessionId,
    });
    if (messageId) sendNack(ws, messageId, "Unauthorized end session");
    return;
  }

  const session = getSession(msg.sessionId);
  if (session) {
    logger.info("👋 Session ended", { djName: session.djName, sessionId: msg.sessionId });

    // 🎚️ Persist tempo votes for the LAST track (if any)
    if (session.currentTrack) {
      const feedback = getTempoFeedback(msg.sessionId);
      if (feedback.total > 0) {
        logger.debug("🎚️ Persisting final tempo votes", { feedback });
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
    endSessionInDb(msg.sessionId).catch((e) => logger.error("❌ Failed to end session in DB", e));

    // 🧹 Clean up all in-memory state
    clearLikesForSession(msg.sessionId);
    clearListeners(msg.sessionId);
    persistedSessions.delete(msg.sessionId);
    lastBroadcastTime.delete(msg.sessionId);
    cleanupSessionQueue(msg.sessionId);
    clearLastPersistedTrackKey(msg.sessionId);

    // Broadcast end session (best effort)
    if (checkBackpressure(rawWs, state.clientId || undefined)) {
      rawWs.publish(
        "live-session",
        JSON.stringify({
          type: "SESSION_ENDED",
          sessionId: msg.sessionId,
        }),
      );
    }
    logSessionEvent(msg.sessionId, "end").catch((e) => logger.error("❌ Telemetry failed", e));
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
    logger.warn(`⚠️ Announcement rejected: session ${announcementSessionId} not found`);
    if (messageId) sendNack(ws, messageId, "Session not found");
    return;
  }

  // 🔐 Security: Verify this connection owns the session
  if (state.djSessionId !== announcementSessionId) {
    logger.warn("⚠️ Unauthorized announcement attempt", {
      owner: state.djSessionId || "none",
      target: announcementSessionId,
    });
    if (messageId) sendNack(ws, messageId, "Unauthorized announcement");
    return;
  }

  const timestamp = new Date().toISOString();
  const endsAt = durationSeconds
    ? new Date(Date.now() + durationSeconds * 1000).toISOString()
    : undefined;

  setSessionAnnouncement(announcementSessionId, {
    message: announcementMessage,
    timestamp,
    ...(endsAt && { endsAt }),
  });

  if (checkBackpressure(rawWs, state.clientId || undefined)) {
    rawWs.publish(
      "live-session",
      JSON.stringify({
        type: "ANNOUNCEMENT_RECEIVED",
        sessionId: announcementSessionId,
        message: announcementMessage,
        djName: djSession.djName,
        timestamp: timestamp,
        endsAt: endsAt,
      }),
    );
  }

  logger.info("📢 Announcement", {
    djName: djSession.djName,
    message: announcementMessage,
    durationSeconds,
    push: msg.push,
  });

  // 11/10: Trigger Push Notifications if requested
  if (msg.push) {
    (async () => {
      try {
        const targets = await db
          .select()
          .from(pushSubscriptions)
          .where(isNull(pushSubscriptions.unsubscribedAt))
          .limit(1000)
          .orderBy(desc(pushSubscriptions.createdAt));

        if (targets.length > 0) {
          logger.info(`[Push] Broadcasting announcement to ${targets.length} targets`);
          const payload = JSON.stringify({
            title: `Announcement from ${djSession.djName}`,
            body: announcementMessage,
            data: { url: "/live" },
          });

          await Promise.allSettled(targets.map((sub) => PushService.send(sub, payload)));
        }
      } catch (e) {
        logger.error("[Push] Failed to broadcast announcement push", e);
      }
    })();
  }

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
    logger.warn(`⚠️ Cancel announcement rejected: session ${cancelSessionId} not found`);
    if (messageId) sendNack(ws, messageId, "Session not found");
    return;
  }

  // 🔐 Security: Verify this connection owns the session
  if (state.djSessionId !== cancelSessionId) {
    logger.warn("⚠️ Unauthorized cancel announcement attempt", {
      owner: state.djSessionId || "none",
      target: cancelSessionId,
    });
    if (messageId) sendNack(ws, messageId, "Unauthorized cancel announcement");
    return;
  }

  setSessionAnnouncement(cancelSessionId, null);

  if (checkBackpressure(rawWs, state.clientId || undefined)) {
    rawWs.publish(
      "live-session",
      JSON.stringify({
        type: "ANNOUNCEMENT_CANCELLED",
        sessionId: cancelSessionId,
      }),
    );
  }

  logger.info(`📢❌ Announcement cancelled for session ${cancelSessionId}`);
  if (messageId) sendAck(ws, messageId);
}
