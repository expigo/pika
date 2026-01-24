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

import { StartPollSchema, EndPollSchema, CancelPollSchema, VoteOnPollSchema } from "@pika/shared";
import { getSession, refreshSessionActivity } from "../lib/sessions";
import { checkBackpressure } from "./utility";
import {
  activePolls,
  endPoll,
  getActivePoll,
  sessionActivePoll,
  recordPollVote,
  setPollTimer,
  type ActivePoll,
} from "../lib/polls";
import { createPollInDb, closePollInDb, recordPollVoteInDb } from "../lib/persistence/polls";
import { sendAck, sendNack, parseMessage } from "../lib/protocol";
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
    console.warn(
      `⚠️ Unauthorized poll attempt: connection owns ${state.djSessionId || "none"}, tried to start poll for ${msg.sessionId}`,
    );
    if (messageId) sendNack(ws, messageId, "Unauthorized poll attempt");
    return;
  }

  const { question, options, durationSeconds } = msg;

  // 🛡️ Safe Limits: Poll Validation
  if (options.length < 2 || options.length > 10) {
    console.warn(`⚠️ Poll rejected: Invalid option count (${options.length})`);
    if (messageId) sendNack(ws, messageId, "Poll must have 2-10 options");
    return;
  }

  if (options.some((opt) => opt.length === 0 || opt.length > 100)) {
    console.warn(`⚠️ Poll rejected: Invalid option length`);
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

  console.log(`📊 Poll started: "${newPoll.question}" (ID: ${pollId})`);

  // Auto-end poll if duration is provided (with timer tracking)
  if (durationSeconds) {
    const timer = setTimeout(async () => {
      const poll = activePolls.get(pollId);
      if (poll) {
        console.log(`📊 Auto-ending poll: ${poll.id}`);
        endPoll(pollId); // This also clears the timer reference
        closePollInDb(pollId).catch((e) => console.error("❌ Failed to close poll in DB:", e));
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
      console.warn(
        `⚠️ Unauthorized end poll attempt: connection owns ${state.djSessionId || "none"}, tried to end poll for ${poll.sessionId}`,
      );
      if (messageId) sendNack(ws, messageId, "Unauthorized end poll");
      return;
    }

    console.log(`📊 Manually ending poll: ${poll.id}`);
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
    closePollInDb(msg.pollId).catch((e) => console.error("❌ Failed to close poll in DB:", e));
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
      console.warn(
        `⚠️ Unauthorized cancel poll attempt: connection owns ${state.djSessionId || "none"}, tried to cancel poll for ${poll.sessionId}`,
      );
      if (messageId) sendNack(ws, messageId, "Unauthorized cancel poll");
      return;
    }

    console.log(`📊 Cancelling poll: ${poll.id}`);
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
    closePollInDb(msg.pollId).catch((e) => console.error("❌ Failed to close poll in DB:", e));
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
      console.log(`⚠️ User ${state.clientId} already voted for poll ${pollId}`);
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
      console.error("❌ Failed to record poll vote in DB:", e),
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
