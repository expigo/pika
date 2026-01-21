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
import { activeSessions } from "../lib/sessions";
import { hasLikedTrack, recordLike } from "../lib/likes";
import { persistLike } from "../lib/persistence/tracks";
import { recordTempoVote, getTempoFeedback } from "../lib/tempo";
import { sendAck, sendNack, parseMessage } from "../lib/protocol";
import type { WSContext } from "./ws-context";

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
    likeSessionId = Array.from(activeSessions.keys())[0];
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
  persistLike(track, likeSessionId, state.clientId);

  // Broadcast the like to all subscribers (including the DJ)
  rawWs.publish(
    "live-session",
    JSON.stringify({
      type: "LIKE_RECEIVED",
      payload: { track },
    }),
  );

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
    rawWs.publish(
      "live-session",
      JSON.stringify({
        type: "REACTION_RECEIVED",
        sessionId: msg.sessionId,
        reaction: "thank_you",
      }),
    );

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
  if (!activeSessions.has(targetSessionId)) {
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

  if (messageId) sendAck(ws, messageId);
}
