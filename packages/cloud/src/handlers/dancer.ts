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

import { SendLikeSchema, SendReactionSchema, SendTempoRequestSchema } from "@pika/shared";
import { getSessionIds, hasSession } from "../lib/sessions";
import { hasLikedTrack, recordLike } from "../lib/likes";
import { persistLike } from "../lib/persistence/tracks";
import { recordTempoVote, getTempoFeedback } from "../lib/tempo";
import { sendAck, sendNack, parseMessage } from "../lib/protocol";
import { checkBackpressure } from "./utility";
import type { WSContext } from "./ws-context";

// 🛡️ Rate Limiting: ClientID -> Array of timestamps
const clientLikeHistory = new Map<string, number[]>();
const LIKE_RATE_LIMIT = 10; // Max likes per window
const LIKE_WINDOW_MS = 60 * 1000; // 1 minute window

// 🧹 Periodic cleanup for dormant clients (Every 5m)
setInterval(
  () => {
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
      console.log(`🧹 Rate Limit Cleanup: Removed ${cleared} dormant clients`);
    }
  },
  5 * 60 * 1000,
);

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
    console.warn(
      `⚠️ DEPRECATED: Like received without sessionId from client ${state.clientId} - update required`,
    );
    likeSessionId = getSessionIds()[0];
  }

  if (!likeSessionId) {
    console.log("⚠️ Like rejected: no active session found");
    if (messageId) sendNack(ws, messageId, "No active session found");
    return;
  }

  // Require clientId for rate limiting
  if (!state.clientId) {
    console.log("⚠️ Like rejected: no clientId provided");
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

  // Cleanup map periodically or lazily? Lazy is fine for now, but a global cleanup would be better for memory.
  // For Sprint 0.2 we fixed memory leaks. Let's not introduce one.
  // Ideally we clean empty entries or old entries.
  // We can add a setInterval cleanup similar to cache if needed, but for now this lazy prune helps.
  // Actually, we should probably delete the key if history becomes empty... but here we just pushed.
  // To avoid unbounded map growth, we should remove listeners logic. Wait, this is likes.
  // Use a cleanup interval for `clientLikeHistory` later?
  // I'll stick to lazy prune on access + S0.2.1-style cleanup if I was touching cache, but I'll leave it simple for Sprint 1 unless requested.

  // 🔐 Security: Check for duplicate likes
  if (hasLikedTrack(likeSessionId, state.clientId, track)) {
    console.log(`⚠️ Duplicate like ignored: ${track.title} from ${state.clientId}`);
    // Just send NACK - don't send non-schema message types
    if (messageId) sendNack(ws, messageId, "Already liked this track");
    return;
  }

  // Record like internally (prevents duplicates)
  recordLike(likeSessionId, state.clientId, track);

  console.log(`❤️ Like: ${track.artist} - ${track.title} from ${state.clientId}`);

  // 💾 Persist to database
  persistLike(track, likeSessionId, state.clientId).catch((e) =>
    console.error("❌ Failed to persist like:", e),
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

    console.log(`🦄 Thank You received from ${state.clientId} in session ${msg.sessionId}`);
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
    console.log("⚠️ Tempo request rejected: no clientId provided");
    if (messageId) sendNack(ws, messageId, "Client ID required for tempo requests");
    return;
  }

  // Verify session exists
  if (!hasSession(targetSessionId)) {
    console.log(`⚠️ Tempo request rejected: session ${targetSessionId} not found`);
    if (messageId) sendNack(ws, messageId, "Session not found");
    return;
  }

  console.log(
    `🎚️ Tempo vote: ${preference} for session ${targetSessionId} (from ${state.clientId})`,
  );

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
