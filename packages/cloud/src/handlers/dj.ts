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
  BroadcastTrackSchema,
  CancelAnnouncementSchema,
  EndSessionSchema,
  logger,
  PIKA_VERSION,
  RegisterSessionSchema,
  SendAnnouncementSchema,
  TIMEOUTS,
  TrackStoppedSchema,
} from "@pika/shared";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "../db";
import { events, stages } from "../db/schema";
import {
  announcementPushLimiter,
  announceToSession,
  cancelSessionAnnouncement,
} from "../lib/announcements";
import { getUserFromToken } from "../lib/auth";
import { clearLikesForSession } from "../lib/likes";
import { clearListeners } from "../lib/listeners";
import { applyNowPlaying, createLiveSession } from "../lib/live-session";
import { checkAndRecordNonce } from "../lib/nonces";
import { cleanupSessionQueue } from "../lib/persistence/queue";
import { endSessionInDb, persistedSessions } from "../lib/persistence/sessions";
import {
  clearLastPersistedTrackKey,
  persistTempoVotes,
  persistTrack,
} from "../lib/persistence/tracks";
import { logSessionEvent, parseMessage, sendAck, sendNack } from "../lib/protocol";
import {
  cancelDjReap,
  clearSessionTrack,
  deleteSession,
  getSession,
  getSessionBroadcastTopic,
  getSessionCount,
  updateSessionTrack,
} from "../lib/sessions";
import { clearStageActiveSession } from "../lib/stages";
import { clearTempoVotes, getTempoFeedback } from "../lib/tempo";
import { DISCOVERY_TOPIC } from "../lib/topics";
import { checkBackpressure } from "./utility";
import type { WSContext } from "./ws-context";

// 🛡️ Rate Limiting State
// Max 1000 concurrent sessions to prevent memory exhaustion (M5)
// biome-ignore lint/complexity/useLiteralKeys: process.env requires brackets in strict TS
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

  announcementPushLimiter.cleanup();
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

  // Reconnect within the DJ grace window? Cancel the pending teardown and treat
  // this as a continuation of the existing session — we must NOT re-broadcast
  // SESSION_STARTED (that would flicker the lobby / in-session dancers). A pending
  // reap timer OR a still-live session both indicate a reconnect.
  const reconnected = cancelDjReap(sessionId) || !!getSession(sessionId);

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
  let djUserId: string | null = null;
  let djName = requestedDjName;

  if (djToken) {
    const djUser = await getUserFromToken(djToken);
    if (djUser && djUser.status === "approved") {
      djUserId = djUser.id;
      djName = djUser.name; // Use registered name
      logger.info("🔐 Authenticated DJ", { djName, djUserId });
    } else if (djUser) {
      // Valid session but not yet approved — withhold verified identity (parity
      // with the REST requireDjAuth 403 gate). Falls through to anonymous mode,
      // which any tokenless client may already use; no verified-profile linkage.
      logger.warn("⚠️ DJ account not approved, using anonymous mode", {
        djUserId: djUser.id,
        status: djUser.status,
      });
    } else {
      logger.warn("⚠️ Invalid token provided, using anonymous mode");
    }
  }

  // 🎭 Resolve optional Stage (seamless DJ rotation). Validate it exists so we
  // never route to a bogus stage; skip the DB check in test mode (mirrors the
  // persist* NODE_ENV short-circuit). An unknown stage is ignored (the session
  // falls back to its own per-session topic — no regression).
  let stageId: string | undefined;
  let stageName: string | undefined;
  let eventName: string | undefined;
  if (msg.stageId) {
    if (process.env.NODE_ENV === "test") {
      stageId = msg.stageId;
    } else {
      // Enriched with names (+ parent event) so the polled /api/sessions/active
      // can label the live stage without its own DB round-trip.
      const [stage] = await db
        .select({ id: stages.id, name: stages.name, eventName: events.name })
        .from(stages)
        .leftJoin(events, eq(events.id, stages.eventId))
        .where(and(eq(stages.id, msg.stageId), isNull(stages.archivedAt)));
      if (stage) {
        stageId = stage.id;
        stageName = stage.name;
        eventName = stage.eventName ?? undefined;
      } else {
        logger.warn("⚠️ REGISTER_SESSION referenced an unknown stage; ignoring", {
          stageId: msg.stageId,
        });
      }
    }
  }

  // 🔧 CRITICAL FIX: Set state.djSessionId BEFORE any async operations
  // This ensures cleanup happens even if disconnect occurs during DB persist
  state.djSessionId = sessionId;
  logger.debug(`🔍 [REGISTER_SESSION] state.djSessionId SET to: ${sessionId}`);

  // Create + persist the session (shared core; also used by the Track D Spotify poller).
  const { session } = await createLiveSession({
    sessionId,
    djName,
    djUserId,
    ...(stageId && { stageId }),
    ...(stageName && { stageName }),
    ...(eventName && { eventName }),
  });

  // Subscribe this DJ connection to the session's audience topic (the stage
  // topic when staged, else the per-session topic) so it receives dancer
  // feedback (likes, reactions, tempo, poll votes). Resolved AFTER the session
  // exists so the stageId is visible. Idempotent on reconnect.
  rawWs.subscribe(getSessionBroadcastTopic(sessionId));

  logger.info("🎧 DJ going live", {
    djName,
    sessionId,
    mode: djUserId ? "Verified" : "Anonymous",
  });

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

  // Broadcast on the discovery topic so lobby browsers see the new session appear.
  // Skip on reconnect-within-grace: the session never ended for dancers/lobby, so
  // re-announcing it would cause a visible flicker.
  if (!reconnected && checkBackpressure(rawWs, state.clientId || undefined).canSend) {
    rawWs.publish(
      DISCOVERY_TOPIC,
      JSON.stringify({
        type: "SESSION_STARTED",
        sessionId,
        djName: session.djName,
        startTime: session.startedAt,
        ...(stageId && { stageId }), // lets stage-mode dancers follow rotation on their stage
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

  // Publish via THIS DJ socket so the sender is excluded and backpressure is honoured
  // (the poller uses a getBroadcaster() publisher instead — see live-session.ts).
  const publish = (topic: string, data: string) => {
    if (checkBackpressure(rawWs, state.clientId || undefined).canSend) {
      rawWs.publish(topic, data);
    }
  };

  if (applyNowPlaying(msg.sessionId, msg.track, publish)) {
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
    if (checkBackpressure(rawWs, state.clientId || undefined).canSend) {
      rawWs.publish(
        getSessionBroadcastTopic(msg.sessionId),
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

    if (checkBackpressure(rawWs, state.clientId || undefined).canSend) {
      rawWs.publish(
        getSessionBroadcastTopic(msg.sessionId),
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

  // Explicit End Set is intentional — cancel any pending reconnect-grace reap.
  cancelDjReap(msg.sessionId);

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

    // Capture the audience topic + stage BEFORE deleteSession (the resolver
    // reads the live session to decide stage-vs-session).
    const broadcastTopic = getSessionBroadcastTopic(msg.sessionId);
    const endedStageId = session.stageId;

    deleteSession(msg.sessionId);
    if (endedStageId) clearStageActiveSession(endedStageId, msg.sessionId);

    // 💾 Update in database
    endSessionInDb(msg.sessionId).catch((e) => logger.error("❌ Failed to end session in DB", e));

    // 🧹 Clean up all in-memory state
    clearLikesForSession(msg.sessionId);
    // A stage's listeners PERSIST across DJ rotation (they stay on stage:{id}
    // waiting for the next DJ); only a stage-less session clears its listeners.
    if (!endedStageId) clearListeners(msg.sessionId);
    persistedSessions.delete(msg.sessionId);
    lastBroadcastTime.delete(msg.sessionId);
    cleanupSessionQueue(msg.sessionId);
    clearLastPersistedTrackKey(msg.sessionId);

    // Drop this DJ connection's subscription to the (now dead) audience topic.
    // The connection stays open and may register a new session later.
    rawWs.unsubscribe(broadcastTopic);

    // Broadcast end session on the discovery topic (best effort) so both
    // in-session dancers and lobby browsers learn the session is over.
    if (checkBackpressure(rawWs, state.clientId || undefined).canSend) {
      rawWs.publish(
        DISCOVERY_TOPIC,
        JSON.stringify({
          type: "SESSION_ENDED",
          sessionId: msg.sessionId,
          ...(endedStageId && { stageId: endedStageId }), // stage-mode dancers show "waiting", not "over"
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

  // Delegate the fan-out (store + broadcast + scoped push) to the shared lib so the REST
  // path (web DJ) and this WS path (desktop DJ) stay identical. Publish via rawWs so the
  // banner excludes the sender and honours this connection's backpressure.
  announceToSession(
    announcementSessionId,
    { message: announcementMessage, durationSeconds, push: msg.push },
    (topic, data) => {
      if (checkBackpressure(rawWs, state.clientId || undefined).canSend) {
        rawWs.publish(topic, data);
      }
    },
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

  cancelSessionAnnouncement(cancelSessionId, (topic, data) => {
    if (checkBackpressure(rawWs, state.clientId || undefined).canSend) {
      rawWs.publish(topic, data);
    }
  });

  if (messageId) sendAck(ws, messageId);
}

/**
 * SYNC_SESSION_HISTORY: DJ synchronizes history (imported tracks)
 */
export async function handleSyncSessionHistory(ctx: WSContext) {
  const { message, ws, rawWs, state, messageId } = ctx;
  const { SyncSessionHistorySchema } = await import("@pika/shared");
  const msg = parseMessage(SyncSessionHistorySchema, message, ws, messageId);
  if (!msg) return;

  // 🔐 Security: Verify this connection owns the session
  if (state.djSessionId !== msg.sessionId) {
    logger.warn("⚠️ Unauthorized history sync attempt", {
      owner: state.djSessionId || "none",
      target: msg.sessionId,
    });
    if (messageId) sendNack(ws, messageId, "Unauthorized history sync");
    return;
  }

  const session = getSession(msg.sessionId);
  if (session) {
    logger.info("📚 Syncing session history", {
      sessionId: msg.sessionId,
      trackCount: msg.tracks.length,
    });

    if (msg.tracks.length > 0) {
      // 💾 Bulk persist to database
      await import("../lib/persistence/tracks").then((m) =>
        m.persistTracksBulk(msg.sessionId, msg.tracks),
      );
    }

    // Confirm sync to DJ
    ws.send(
      JSON.stringify({
        type: "HISTORY_SYNCED",
        sessionId: msg.sessionId,
        count: msg.tracks.length,
      }),
    );

    // 📢 Broadcast sync event to this session's participants so they refresh history
    if (checkBackpressure(rawWs, state.clientId || undefined).canSend) {
      rawWs.publish(
        getSessionBroadcastTopic(msg.sessionId),
        JSON.stringify({
          type: "HISTORY_SYNCED",
          sessionId: msg.sessionId,
          count: msg.tracks.length,
        }),
      );
    }

    if (messageId) sendAck(ws, messageId);
  } else {
    if (messageId) sendNack(ws, messageId, "Session not found");
  }
}
