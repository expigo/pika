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
import { getSession } from "../lib/sessions";
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

  // Broadcast poll arrival to all listeners
  rawWs.publish(
    "live-session",
    JSON.stringify({
      type: "POLL_STARTED",
      pollId,
      sessionId: msg.sessionId,
      question,
      options,
      endsAt: endsAt?.toISOString(),
    }),
  );

  console.log(`📊 Poll started: "${question}" (ID: ${pollId}, sessionId: ${msg.sessionId})`);

  // Auto-end poll if duration is provided (with timer tracking)
  if (durationSeconds) {
    const timer = setTimeout(async () => {
      const poll = activePolls.get(pollId);
      if (poll) {
        console.log(`📊 Auto-ending poll: ${poll.id}`);
        endPoll(pollId); // This also clears the timer reference
        await closePollInDb(pollId);
        const totalVotes = poll.votes.reduce((a, b) => a + b, 0);
        const winnerIndex = totalVotes > 0 ? poll.votes.indexOf(Math.max(...poll.votes)) : 0;
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
    await closePollInDb(msg.pollId);

    const totalVotes = poll.votes.reduce((a, b) => a + b, 0);
    const winnerIndex = totalVotes > 0 ? poll.votes.indexOf(Math.max(...poll.votes)) : 0;
    rawWs.publish(
      "live-session",
      JSON.stringify({
        type: "POLL_ENDED",
        pollId: poll.id,
        results: poll.votes,
        totalVotes,
        winnerIndex,
      }),
    );
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
      console.warn(
        `⚠️ Unauthorized cancel poll attempt: connection owns ${state.djSessionId || "none"}, tried to cancel poll for ${poll.sessionId}`,
      );
      if (messageId) sendNack(ws, messageId, "Unauthorized cancel poll");
      return;
    }

    console.log(`📊 Cancelling poll: ${poll.id}`);
    endPoll(msg.pollId);
    await closePollInDb(msg.pollId); // Mark as closed in DB too

    // For cancelled polls, send 0 results
    rawWs.publish(
      "live-session",
      JSON.stringify({
        type: "POLL_ENDED",
        pollId: poll.id,
        results: poll.votes.map(() => 0), // Zero out results for cancelled polls
        totalVotes: 0,
        winnerIndex: 0,
      }),
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
    recordPollVoteInDb(pollId, state.clientId, optionIndex);

    const totalVotes = poll.votes.reduce((a, b) => a + b, 0);

    // Broadcast poll update to all subscribers
    rawWs.publish(
      "live-session",
      JSON.stringify({
        type: "POLL_UPDATE",
        pollId: poll.id,
        sessionId: poll.sessionId,
        votes: poll.votes,
        totalVotes,
      }),
    );

    if (messageId) sendAck(ws, messageId);
  } else {
    if (messageId) sendNack(ws, messageId, "Poll not found or already ended");
  }
}
