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
import { closePollInDb, createPollInDb, recordPollVoteInDb } from "../lib/persistence/polls";
import {
  type ActivePoll,
  activePolls,
  endPoll,
  getActivePoll,
  recordPollVote,
  sessionActivePoll,
  setPollTimer,
} from "../lib/polls";
import { parseMessage, sendAck, sendNack } from "../lib/protocol";
import { getSession, refreshSessionActivity } from "../lib/sessions";
import { checkBackpressure } from "./utility";
import type { WSContext } from "./ws-context";

/**
 * START_POLL: DJ starts a new live poll
 */
export async function handleStartPoll(ctx: WSContext) {
  const { message, ws, rawWs, state, messageId } = ctx;
  const msg = parseMessage(StartPollSchema, message, ws, messageId);
  if (!msg) return;

  // Verify this is a DJ starting a poll for their own session
  if (state.djSessionId !== msg.sessionId) {
    logger.warn("⚠️ Unauthorized poll attempt", {
      owner: state.djSessionId || "none",
      target: msg.sessionId,
    });
    if (messageId) sendNack(ws, messageId, "Unauthorized poll attempt");
    return;
  }

  const { question, options, durationSeconds } = msg;

  // 🛡️ Safe Limits: Poll Validation
  if (options.length < 2 || options.length > 10) {
    logger.warn(`⚠️ Poll rejected: Invalid option count (${options.length})`);
    if (messageId) sendNack(ws, messageId, "Poll must have 2-10 options");
    return;
  }

  if (options.some((opt) => opt.length === 0 || opt.length > 100)) {
    logger.warn("⚠️ Poll rejected: Invalid option length");
    if (messageId) sendNack(ws, messageId, "Poll options must be 1-100 characters");
    return;
  }

  const session = getSession(msg.sessionId);

  // 💾 Persist poll to database first to get an ID
  const pollId = await createPollInDb(msg.sessionId, question, options, session?.currentTrack);

  if (!pollId) {
    if (messageId) sendNack(ws, messageId, "Failed to create poll in database");
    return;
  }

  const endsAt = durationSeconds ? new Date(Date.now() + durationSeconds * 1000) : undefined;

  const newPoll: ActivePoll = {
    id: pollId,
    sessionId: msg.sessionId,
    question,
    options,
    votes: new Array(options.length).fill(0),
    votedClients: new Map(),
    ...(endsAt && { endsAt }),
  };

  activePolls.set(pollId, newPoll);
  sessionActivePoll.set(msg.sessionId, pollId);
  refreshSessionActivity(msg.sessionId);

  // Broadcast poll arrival to all listeners
  if (checkBackpressure(rawWs, state.clientId || undefined)) {
    rawWs.publish(
      "live-session",
      JSON.stringify({
        type: "POLL_STARTED",
        sessionId: msg.sessionId,
        pollId: newPoll.id,
        question: newPoll.question,
        options: newPoll.options,
        endsAt: newPoll.endsAt?.toISOString(),
      }),
    );
  }

  logger.info("📊 Poll started", {
    question: newPoll.question,
    pollId,
    sessionId: msg.sessionId,
  });

  // Auto-end poll if duration is provided (with timer tracking)
  if (durationSeconds) {
    const timer = setTimeout(async () => {
      const poll = activePolls.get(pollId);
      if (poll) {
        logger.info(`📊 Auto-ending poll: ${poll.id}`);
        endPoll(pollId); // This also clears the timer reference
        closePollInDb(pollId).catch((e) => logger.error("❌ Failed to close poll in DB", e));
        const totalVotes = poll.votes.reduce((a, b) => a + b, 0);
        const winnerIndex = totalVotes > 0 ? poll.votes.indexOf(Math.max(...poll.votes)) : 0;
        if (checkBackpressure(rawWs, state.clientId || undefined)) {
          rawWs.publish(
            "live-session",
            JSON.stringify({
              type: "POLL_ENDED",
              pollId,
              results: poll.votes,
              totalVotes,
              winnerIndex,
            }),
          );
        }
      }
    }, durationSeconds * 1000);
    // Track the timer so it can be cancelled if poll ends early
    setPollTimer(pollId, timer);
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
    endPoll(msg.pollId);
    refreshSessionActivity(poll.sessionId);
    const totalVotes = poll.votes.reduce((a, b) => a + b, 0);

    // Broadcast results
    if (checkBackpressure(rawWs, state.clientId || undefined)) {
      rawWs.publish(
        "live-session",
        JSON.stringify({
          type: "POLL_ENDED",
          pollId: msg.pollId,
          results: poll.votes,
          totalVotes,
          winnerIndex: poll.votes.indexOf(Math.max(...poll.votes)),
        }),
      );
    }

    if (messageId) sendAck(ws, messageId);

    // DB op after broadcast
    closePollInDb(msg.pollId).catch((e) => logger.error("❌ Failed to close poll in DB", e));
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
    endPoll(msg.pollId);
    refreshSessionActivity(poll.sessionId);
    // For cancelled polls, send 0 results
    if (checkBackpressure(rawWs, state.clientId || undefined)) {
      rawWs.publish(
        "live-session",
        JSON.stringify({
          type: "POLL_ENDED",
          pollId: msg.pollId,
          results: poll.options.map(() => 0),
          totalVotes: 0,
          winnerIndex: -1,
        }),
      );
    }

    if (messageId) sendAck(ws, messageId);
    closePollInDb(msg.pollId).catch((e) => logger.error("❌ Failed to close poll in DB", e));
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

    // Broadcast live update to DJ (and potentially others)
    if (checkBackpressure(rawWs, state.clientId || undefined)) {
      rawWs.publish(
        "live-session",
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
