/**
 * Poll Message Handlers
 *
 * Handles WebSocket messages related to live polls:
 * - START_POLL
 * - END_POLL
 * - CANCEL_POLL
 * - VOTE_ON_POLL
 *
 * @file packages/cloud/src/handlers/poll.ts
 * @package @pika/cloud
 * @created 2026-01-21
 */

import {
  CancelPollSchema,
  EndPollSchema,
  logger,
  StartPollSchema,
  VoteOnPollSchema,
} from "@pika/shared";
import { recordPollVoteInDb } from "../lib/persistence/polls";
import {
  endPollForSession,
  getActivePoll,
  recordPollVote,
  startPollForSession,
} from "../lib/polls";
import { parseMessage, sendAck, sendNack } from "../lib/protocol";
import { getSessionBroadcastTopic } from "../lib/sessions";
import { checkBackpressure } from "./utility";
import type { WSContext } from "./ws-context";

/**
 * START_POLL: DJ starts a new live poll
 */
export async function handleStartPoll(ctx: WSContext) {
  const { message, ws, rawWs, state, messageId } = ctx;
  const msg = parseMessage(StartPollSchema, message, ws, messageId);
  if (!msg) return;

  // 🔐 Security: Verify this is a DJ starting a poll for their own session (WS-only check).
  if (state.djSessionId !== msg.sessionId) {
    logger.warn("⚠️ Unauthorized poll attempt", {
      owner: state.djSessionId || "none",
      target: msg.sessionId,
    });
    if (messageId) sendNack(ws, messageId, "Unauthorized poll attempt");
    return;
  }

  const { question, options, durationSeconds } = msg;

  // Validation + create + broadcast lives in the shared lib (REST shares it). Publish via rawWs so
  // the sender is excluded and this connection's backpressure is honoured.
  const result = await startPollForSession(
    { sessionId: msg.sessionId, question, options, durationSeconds },
    (topic, data) => {
      if (checkBackpressure(rawWs, state.clientId || undefined).canSend) {
        rawWs.publish(topic, data);
      }
    },
  );

  if (!result.ok) {
    logger.warn("⚠️ Poll rejected", { sessionId: msg.sessionId, error: result.error });
    if (messageId) sendNack(ws, messageId, result.error ?? "Failed to start poll");
    return;
  }

  if (messageId) sendAck(ws, messageId);
}

/**
 * END_POLL: DJ manually ends an active poll
 */
export async function handleEndPoll(ctx: WSContext) {
  const { message, ws, rawWs, state, messageId } = ctx;
  const msg = parseMessage(EndPollSchema, message, ws, messageId);
  if (!msg) return;

  const poll = getActivePoll(msg.pollId);
  if (poll) {
    // 🔐 Security: Verify this connection owns the session
    if (state.djSessionId !== poll.sessionId) {
      logger.warn("⚠️ Unauthorized end poll attempt", {
        owner: state.djSessionId || "none",
        target: poll.sessionId,
      });
      if (messageId) sendNack(ws, messageId, "Unauthorized end poll");
      return;
    }

    logger.info(`📊 Manually ending poll: ${poll.id}`);
    endPollForSession(msg.pollId, (topic, data) => {
      if (checkBackpressure(rawWs, state.clientId || undefined).canSend) {
        rawWs.publish(topic, data);
      }
    });

    if (messageId) sendAck(ws, messageId);
  } else {
    if (messageId) sendNack(ws, messageId, "Poll not found");
  }
}

/**
 * CANCEL_POLL: DJ cancels an active poll (no results)
 */
export async function handleCancelPoll(ctx: WSContext) {
  const { message, ws, rawWs, state, messageId } = ctx;
  const msg = parseMessage(CancelPollSchema, message, ws, messageId);
  if (!msg) return;

  const poll = getActivePoll(msg.pollId);
  if (poll) {
    // 🔐 Security: Verify this connection owns the session
    if (state.djSessionId !== poll.sessionId) {
      logger.warn("⚠️ Unauthorized cancel poll attempt", {
        owner: state.djSessionId || "none",
        target: poll.sessionId,
      });
      if (messageId) sendNack(ws, messageId, "Unauthorized cancel poll");
      return;
    }

    logger.info(`📊 Cancelling poll: ${poll.id}`);
    // Cancelled polls report zeroed results (no winner).
    endPollForSession(
      msg.pollId,
      (topic, data) => {
        if (checkBackpressure(rawWs, state.clientId || undefined).canSend) {
          rawWs.publish(topic, data);
        }
      },
      { cancelled: true },
    );

    if (messageId) sendAck(ws, messageId);
  } else {
    if (messageId) sendNack(ws, messageId, "Poll not found");
  }
}

/**
 * VOTE_ON_POLL: Dancer votes for a poll option
 */
export async function handleVoteOnPoll(ctx: WSContext) {
  const { message, ws, rawWs, state, messageId } = ctx;
  const msg = parseMessage(VoteOnPollSchema, message, ws, messageId);
  if (!msg) return;

  const { pollId, optionIndex } = msg;

  if (!state.clientId) {
    if (messageId) sendNack(ws, messageId, "Client ID required to vote");
    return;
  }

  const poll = getActivePoll(pollId);
  if (poll) {
    // 🔐 Security: Check if client already voted
    if (poll.votedClients.has(state.clientId)) {
      logger.debug(`⚠️ User already voted for poll`, { clientId: state.clientId, pollId });
      if (messageId) sendAck(ws, messageId);
      return;
    }

    // 🔐 Security: Validate option index
    if (optionIndex < 0 || optionIndex >= poll.options.length) {
      if (messageId) sendNack(ws, messageId, "Invalid option index");
      return;
    }

    // Record vote in memory
    recordPollVote(pollId, state.clientId, optionIndex);

    // 💾 Persist vote to database
    recordPollVoteInDb(pollId, state.clientId, optionIndex).catch((e) =>
      logger.error("❌ Failed to record poll vote in DB", e),
    );

    const totalVotes = poll.votes.reduce((a, b) => a + b, 0);

    // Broadcast live update to this session's DJ (and potentially others)
    if (checkBackpressure(rawWs, state.clientId || undefined).canSend) {
      rawWs.publish(
        getSessionBroadcastTopic(poll.sessionId),
        JSON.stringify({
          type: "POLL_UPDATE",
          pollId: msg.pollId,
          votes: poll.votes,
          totalVotes,
          sessionId: poll.sessionId,
        }),
      );
    }

    if (messageId) sendAck(ws, messageId);
  } else {
    if (messageId) sendNack(ws, messageId, "Poll not found or already ended");
  }
}
