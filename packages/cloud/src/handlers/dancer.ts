/**
 * Dancer Message Handlers
 *
 * Handles WebSocket messages from dancer clients:
 * - SEND_LIKE
 * - SEND_REACTION
 * - SEND_TEMPO_REQUEST
 *
 * @file packages/cloud/src/handlers/dancer.ts
 * @package @pika/cloud
 * @created 2026-01-21
 */

import {
  LIMITS,
  logger,
  SendBulkLikeSchema,
  SendLikeSchema,
  SendReactionSchema,
  SendRemoveLikeSchema,
  SendTempoRequestSchema,
  TIMEOUTS,
} from "@pika/shared";
import { hasLikedTrack, recordLike, removeLike } from "../lib/likes";
import { deletePersistedLike, persistLike } from "../lib/persistence/tracks";
import { parseMessage, sendAck, sendNack } from "../lib/protocol";
import { getSessionIds, hasSession } from "../lib/sessions";
import { getTempoFeedback, recordTempoVote } from "../lib/tempo";
import { checkBackpressure } from "./utility";
import type { WSContext } from "./ws-context";

// 🛡️ Rate Limiting: ClientID -> Array of timestamps
const clientLikeHistory = new Map<string, number[]>();
const LIKE_RATE_LIMIT = LIMITS.LIKE_RATE_LIMIT_MAX;
const LIKE_WINDOW_MS = LIMITS.LIKE_RATE_LIMIT_WINDOW;

// 🧹 Periodic cleanup for dormant clients (Every 5m)
setInterval(() => {
  const now = Date.now();
  let cleared = 0;
  for (const [clientId, history] of clientLikeHistory.entries()) {
    // If the newest like is older than the window, the whole history is stale
    const newest = history[history.length - 1];
    if (!newest || now - newest > LIKE_WINDOW_MS) {
      clientLikeHistory.delete(clientId);
      cleared++;
    }
  }
  if (cleared > 0) {
    logger.info("🧹 Rate Limit Cleanup completed", { clearedClients: cleared });
  }
}, TIMEOUTS.CLEANUP_INTERVAL);

/**
 * SEND_LIKE: Dancer likes the currently playing track
 */
export async function handleSendLike(ctx: WSContext) {
  const { message, ws, rawWs, state, messageId } = ctx;
  const msg = parseMessage(SendLikeSchema, message, ws, messageId);
  if (!msg) return;

  const track = msg.payload.track;
  // Get sessionId from message (required for new clients)
  let likeSessionId = msg.sessionId;

  // DEPRECATED: Legacy fallback for clients without sessionId (remove after v0.3.0)
  if (!likeSessionId) {
    logger.warn(
      `⚠️ DEPRECATED: Like received without sessionId from client ${state.clientId} - update required`,
    );
    likeSessionId = getSessionIds()[0];
  }

  if (!likeSessionId) {
    logger.warn("⚠️ Like rejected: no active session found");
    if (messageId) sendNack(ws, messageId, "No active session found");
    return;
  }

  // Require clientId for rate limiting
  if (!state.clientId) {
    logger.warn("⚠️ Like rejected: no clientId provided");
    if (messageId) sendNack(ws, messageId, "Client ID required for likes");
    return;
  }

  // 🛡️ Rate Limiting
  const now = Date.now();
  let history = clientLikeHistory.get(state.clientId) || [];
  // Prune history
  history = history.filter((t) => now - t < LIKE_WINDOW_MS);

  if (history.length >= LIKE_RATE_LIMIT) {
    if (messageId) sendNack(ws, messageId, "Rate limit exceeded (max 10/min)");
    return;
  }

  history.push(now);
  clientLikeHistory.set(state.clientId, history);

  // 🔐 Security: Check for duplicate likes
  if (hasLikedTrack(likeSessionId, state.clientId, track)) {
    logger.warn("⚠️ Duplicate like ignored", {
      track: `${track.artist} - ${track.title}`,
      clientId: state.clientId,
    });
    // Just send NACK - don't send non-schema message types
    if (messageId) sendNack(ws, messageId, "Already liked this track");
    return;
  }

  // Record like internally (prevents duplicates)
  recordLike(likeSessionId, state.clientId, track);

  logger.info("❤️ Like received", {
    artist: track.artist,
    title: track.title,
    clientId: state.clientId,
    sessionId: likeSessionId,
  });

  // 💾 Persist to database
  persistLike(track, likeSessionId, state.clientId).catch((e) =>
    logger.error("❌ Failed to persist like", e),
  );

  // Broadcast the like to all subscribers (including the DJ)
  if (checkBackpressure(rawWs, state.clientId || undefined)) {
    rawWs.publish(
      "live-session",
      JSON.stringify({
        type: "LIKE_RECEIVED",
        payload: { track },
      }),
    );
  }

  if (messageId) sendAck(ws, messageId);
}

/**
 * REMOVE_LIKE: Dancer undoes a like
 */
export async function handleRemoveLike(ctx: WSContext) {
  const { message, ws, state, messageId } = ctx;
  const msg = parseMessage(SendRemoveLikeSchema, message, ws, messageId);
  if (!msg) return;

  const track = msg.payload.track;
  const sessionId = msg.sessionId || getSessionIds()[0];

  if (!sessionId || !state.clientId) {
    if (messageId) sendNack(ws, messageId, "Session or Client ID missing");
    return;
  }

  // Remove from internal tracking
  removeLike(sessionId, state.clientId, track);

  logger.info("💔 Like removed", {
    artist: track.artist,
    title: track.title,
    clientId: state.clientId,
    sessionId,
  });

  // 💾 Sync with database
  deletePersistedLike(track, sessionId, state.clientId).catch((e) =>
    logger.error("❌ Failed to delete persisted like", e),
  );

  if (messageId) sendAck(ws, messageId);
}

/**
 * SEND_BULK_LIKE: Dancer flushes multiple likes (after reconnect)
 */
export async function handleSendBulkLike(ctx: WSContext) {
  const { message, ws, rawWs, state, messageId } = ctx;
  const msg = parseMessage(SendBulkLikeSchema, message, ws, messageId);
  if (!msg) return;

  const tracks = msg.payload.tracks;
  const likeSessionId = msg.sessionId || getSessionIds()[0];

  if (!likeSessionId || !state.clientId) {
    if (messageId) sendNack(ws, messageId, "Session or Client ID missing");
    return;
  }

  logger.info(`📦 Bulk likes received (${tracks.length})`, {
    clientId: state.clientId,
    sessionId: likeSessionId,
  });

  // Small batch limit to prevent abuse (e.g., 100 tracks per batch)
  const MAX_BATCH = 100;
  const processingTracks = tracks.slice(0, MAX_BATCH);

  for (const track of processingTracks) {
    // Skip duplicates in batch
    if (hasLikedTrack(likeSessionId, state.clientId, track)) continue;

    recordLike(likeSessionId, state.clientId, track);
    persistLike(track, likeSessionId, state.clientId).catch(() => {});

    // Broadcast individually to DJ/Subscribers so regular animations/events fire
    if (checkBackpressure(rawWs, state.clientId || undefined)) {
      rawWs.publish(
        "live-session",
        JSON.stringify({
          type: "LIKE_RECEIVED",
          payload: { track },
        }),
      );
    }
  }

  if (messageId) sendAck(ws, messageId);
}

/**
 * SEND_REACTION: Dancer sends a transient emoji reaction
 */
export function handleSendReaction(ctx: WSContext) {
  const { message, ws, rawWs, state, messageId } = ctx;
  const msg = parseMessage(SendReactionSchema, message, ws, messageId);
  if (!msg) return;

  if (msg.reaction === "thank_you") {
    // Broadcast reaction to all subscribers
    if (checkBackpressure(rawWs, state.clientId || undefined)) {
      rawWs.publish(
        "live-session",
        JSON.stringify({
          type: "REACTION_RECEIVED",
          sessionId: msg.sessionId,
          reaction: "thank_you",
        }),
      );
    }

    logger.info("🦄 Thank You received", {
      clientId: state.clientId,
      sessionId: msg.sessionId,
    });

    if (messageId) sendAck(ws, messageId);
  } else {
    if (messageId) sendNack(ws, messageId, "Unsupported reaction type");
  }
}

/**
 * SEND_TEMPO_REQUEST: Dancer votes on current song tempo
 */
export function handleSendTempoRequest(ctx: WSContext) {
  const { message, ws, rawWs, state, messageId } = ctx;
  const msg = parseMessage(SendTempoRequestSchema, message, ws, messageId);
  if (!msg) return;

  const { sessionId: targetSessionId, preference } = msg;

  // Require clientId for rate limiting
  if (!state.clientId) {
    logger.warn("⚠️ Tempo request rejected: no clientId provided");
    if (messageId) sendNack(ws, messageId, "Client ID required for tempo requests");
    return;
  }

  // Verify session exists
  if (!hasSession(targetSessionId)) {
    logger.warn(`⚠️ Tempo request rejected: session ${targetSessionId} not found`);
    if (messageId) sendNack(ws, messageId, "Session not found");
    return;
  }

  logger.info("🎚️ Tempo vote received", {
    preference,
    sessionId: targetSessionId,
    clientId: state.clientId,
  });

  // Record the vote (skip if "clear" as it's a toggle-off)
  if (preference !== "clear") {
    recordTempoVote(targetSessionId, state.clientId, preference);
  }

  // Get updated aggregates
  const feedback = getTempoFeedback(targetSessionId);

  // Broadcast updated aggregates to all subscribers
  if (checkBackpressure(rawWs, state.clientId || undefined)) {
    rawWs.publish(
      "live-session",
      JSON.stringify({
        type: "TEMPO_FEEDBACK",
        sessionId: targetSessionId,
        faster: feedback.faster,
        slower: feedback.slower,
        perfect: feedback.perfect,
        total: feedback.total,
      }),
    );
  }

  if (messageId) sendAck(ws, messageId);
}
