/**
 * Poll State Management
 *
 * @file polls.ts
 * @package @pika/cloud
 * @created 2026-01-21
 *
 * PURPOSE:
 * Manages active polls in memory for real-time voting.
 * One poll per session at a time.
 *
 * FUTURE:
 * Can swap Map for Redis with pub/sub for distributed polling.
 */
import { logger } from "@pika/shared";
import { getBroadcaster } from "./broadcaster";
import type { PublishFn } from "./live-session";
import { closePollInDb, createPollInDb } from "./persistence/polls";
import { getSession, getSessionBroadcastTopic, refreshSessionActivity } from "./sessions";

// ============================================================================
// Types
// ============================================================================

export interface ActivePoll {
  id: number;
  sessionId: string;
  question: string;
  options: string[];
  votes: number[]; // Vote count per option
  votedClients: Map<string, number>; // clientId -> optionIndex (for restoration)
  endsAt?: Date; // Optional auto-close time
}

export interface PollResults {
  question: string;
  options: string[];
  votes: number[];
  totalVotes: number;
  winner: number; // Index of winning option
}

// ============================================================================
// State
// ============================================================================

// Map: pollId -> ActivePoll
const activePolls = new Map<number, ActivePoll>();

// Map: sessionId -> current active poll ID (one poll at a time per session)
const sessionActivePoll = new Map<string, number>();

// Map: pollId -> Timer reference (for auto-end timers)
const pollTimers = new Map<number, Timer>();

// In-memory id source for the createPoll() TEST helper below. NOT used at runtime —
// production poll ids come from the DB (createPollInDb → serial).
let nextPollId = 1;

// ============================================================================
// Timer Management
// ============================================================================

/**
 * Set an auto-end timer for a poll
 * 🛡️ P0 Fix: Timers are unref'd to prevent blocking graceful shutdown
 */
export function setPollTimer(pollId: number, timer: Timer): void {
  // Clear any existing timer first
  cancelPollTimer(pollId);
  // 🛡️ P0 Fix: Unref the timer so it doesn't prevent graceful shutdown
  if (timer.unref) {
    timer.unref();
  }
  pollTimers.set(pollId, timer);
}

/**
 * Cancel the auto-end timer for a poll
 */
export function cancelPollTimer(pollId: number): void {
  const timer = pollTimers.get(pollId);
  if (timer) {
    clearTimeout(timer);
    pollTimers.delete(pollId);
    logger.debug("⏰ Cleared auto-end timer", { pollId });
  }
}

// ============================================================================
// Operations
// ============================================================================

/**
 * Get a poll by ID
 */
export function getActivePoll(pollId: number): ActivePoll | undefined {
  return activePolls.get(pollId);
}

/**
 * Get active poll for a session
 */
export function getSessionPoll(sessionId: string): ActivePoll | undefined {
  const pollId = sessionActivePoll.get(sessionId);
  return pollId ? activePolls.get(pollId) : undefined;
}

/**
 * Check if session has an active poll
 */
export function hasActivePoll(sessionId: string): boolean {
  return sessionActivePoll.has(sessionId);
}

/**
 * TEST-ONLY in-memory poll factory (seeds activePolls + sessionActivePoll). Production polls are
 * created via createPollInDb() + handleStartPoll using DB-assigned ids — this is never called at
 * runtime; it stays here because robustness.test.ts + handler-topic-routing.test.ts import it.
 */
export function createPoll(
  sessionId: string,
  question: string,
  options: string[],
  durationSeconds?: number,
): ActivePoll {
  const pollId = nextPollId++;

  const poll: ActivePoll = {
    id: pollId,
    sessionId,
    question,
    options,
    votes: options.map(() => 0),
    votedClients: new Map(),
    ...(durationSeconds ? { endsAt: new Date(Date.now() + durationSeconds * 1000) } : {}),
  };

  activePolls.set(pollId, poll);
  sessionActivePoll.set(sessionId, pollId);

  return poll;
}

/**
 * Record a vote for a poll
 * @returns true if vote was recorded, false if already voted or invalid
 */
export function recordPollVote(
  pollId: number,
  clientId: string,
  optionIndex: number,
): { success: boolean; error?: string } {
  const poll = activePolls.get(pollId);
  if (!poll) {
    return { success: false, error: "Poll not found" };
  }

  if (poll.votedClients.has(clientId)) {
    return { success: false, error: "Already voted" };
  }

  // 🛡️ R4 Fix: Defensive check for poll expiration (TOCTOU)
  // Even though Node is single-threaded, ensuring we don't accept votes after end time is critical
  if (poll.endsAt && Date.now() > poll.endsAt.getTime()) {
    return { success: false, error: "Poll has ended" };
  }

  if (optionIndex < 0 || optionIndex >= poll.options.length) {
    return { success: false, error: "Invalid option" };
  }

  poll.votes[optionIndex] = (poll.votes[optionIndex] || 0) + 1;
  poll.votedClients.set(clientId, optionIndex);

  return { success: true };
}

/**
 * Get the option index a client voted for
 */
export function getClientVote(pollId: number, clientId: string): number | undefined {
  const poll = activePolls.get(pollId);
  return poll?.votedClients.get(clientId);
}

/**
 * End a poll and return results (also cancels any pending timer)
 */
export function endPoll(pollId: number): ActivePoll | undefined {
  const poll = activePolls.get(pollId);
  if (poll) {
    // Cancel any auto-end timer to prevent double-ending
    cancelPollTimer(pollId);
    activePolls.delete(pollId);
    sessionActivePoll.delete(poll.sessionId);
  }
  return poll;
}

/**
 * Get poll results without ending it
 */
export function getPollResults(pollId: number): PollResults | undefined {
  const poll = activePolls.get(pollId);
  if (!poll) return undefined;

  const totalVotes = poll.votes.reduce((a, b) => a + b, 0);
  const winner = poll.votes.indexOf(Math.max(...poll.votes));

  return {
    question: poll.question,
    options: poll.options,
    votes: poll.votes,
    totalVotes,
    winner,
  };
}

/**
 * Clear any active poll for a session (M4 Fix)
 */
export function clearSessionPolls(sessionId: string): void {
  const pollId = sessionActivePoll.get(sessionId);
  if (pollId) {
    cancelPollTimer(pollId);
    activePolls.delete(pollId);
    sessionActivePoll.delete(sessionId);
    logger.debug("🧹 Cleared active poll for session", { sessionId });
  }
}

/**
 * Clear all polls (for testing)
 */
export function clearAllPolls(): void {
  // Clear all timers first
  for (const [pollId] of pollTimers) {
    cancelPollTimer(pollId);
  }
  activePolls.clear();
  sessionActivePoll.clear();
  nextPollId = 1;
}

// ============================================================================
// Orchestration (shared by the WS handlers and the REST endpoints)
//
// These wrap the in-memory state + DB + broadcast so both the desktop DJ (WS, passing
// rawWs.publish for sender-exclusion + backpressure) and the web DJ (REST, passing a
// getBroadcaster()-based publish) drive identical fan-out. Transport stays the caller's job.
// ============================================================================

export interface StartPollResult {
  ok: boolean;
  pollId?: number;
  error?: string;
}

function broadcastPollEnded(
  sessionId: string,
  pollId: number,
  votes: number[],
  publish: PublishFn,
): void {
  const totalVotes = votes.reduce((a, b) => a + b, 0);
  const winnerIndex = totalVotes > 0 ? votes.indexOf(Math.max(...votes)) : -1;
  publish(
    getSessionBroadcastTopic(sessionId),
    JSON.stringify({
      type: "POLL_ENDED",
      sessionId,
      pollId,
      results: votes,
      totalVotes,
      winnerIndex,
    }),
  );
}

/**
 * Validate + create + broadcast a new poll for a session. Returns the new `pollId` on success or a
 * caller-facing `error` (bad option count/length, or a poll already active). The optional auto-end
 * timer publishes the POLL_ENDED via `getBroadcaster()` directly — it fires after the request that
 * started the poll has ended, so the originating socket may be gone.
 */
export async function startPollForSession(
  params: {
    sessionId: string;
    question: string;
    options: string[];
    durationSeconds?: number | undefined;
  },
  publish: PublishFn,
): Promise<StartPollResult> {
  const { sessionId, question, options, durationSeconds } = params;

  if (options.length < 2 || options.length > 10) {
    return { ok: false, error: "Poll must have 2-10 options" };
  }
  if (options.some((opt) => opt.length === 0 || opt.length > 100)) {
    return { ok: false, error: "Poll options must be 1-100 characters" };
  }
  // 🛡️ One active poll per session — never orphan a poll (with a live auto-end timer) in activePolls.
  if (hasActivePoll(sessionId)) {
    return { ok: false, error: "A poll is already active — end it first" };
  }

  const session = getSession(sessionId);
  const pollId = await createPollInDb(sessionId, question, options, session?.currentTrack);
  if (!pollId) {
    return { ok: false, error: "Failed to create poll in database" };
  }

  const endsAt = durationSeconds ? new Date(Date.now() + durationSeconds * 1000) : undefined;
  const newPoll: ActivePoll = {
    id: pollId,
    sessionId,
    question,
    options,
    votes: new Array(options.length).fill(0),
    votedClients: new Map(),
    ...(endsAt && { endsAt }),
  };

  activePolls.set(pollId, newPoll);
  sessionActivePoll.set(sessionId, pollId);
  refreshSessionActivity(sessionId);

  publish(
    getSessionBroadcastTopic(sessionId),
    JSON.stringify({
      type: "POLL_STARTED",
      sessionId,
      pollId,
      question,
      options,
      endsAt: newPoll.endsAt?.toISOString(),
    }),
  );

  logger.info("📊 Poll started", { question, pollId, sessionId });

  if (durationSeconds) {
    const timer = setTimeout(() => {
      const poll = activePolls.get(pollId);
      if (!poll) return;
      logger.info(`📊 Auto-ending poll: ${poll.id}`);
      const votes = [...poll.votes];
      endPoll(pollId);
      closePollInDb(pollId).catch((e) => logger.error("❌ Failed to close poll in DB", e));
      // The starting socket may be gone — publish via the shared server broadcaster.
      const broadcaster = getBroadcaster();
      if (broadcaster) {
        broadcastPollEnded(sessionId, pollId, votes, (topic, data) =>
          broadcaster.publish(topic, data),
        );
      }
    }, durationSeconds * 1000);
    setPollTimer(pollId, timer);
  }

  return { ok: true, pollId };
}

/**
 * End an active poll: remove it from memory (cancelling its auto-end timer), broadcast POLL_ENDED,
 * and close it in the DB. Pass `cancelled: true` to report zeroed results (no winner). Returns the
 * ended poll, or `undefined` if the poll wasn't active.
 */
export function endPollForSession(
  pollId: number,
  publish: PublishFn,
  opts?: { cancelled?: boolean },
): ActivePoll | undefined {
  const poll = activePolls.get(pollId);
  if (!poll) return undefined;

  const votes = opts?.cancelled ? poll.options.map(() => 0) : [...poll.votes];
  endPoll(pollId);
  refreshSessionActivity(poll.sessionId);
  broadcastPollEnded(poll.sessionId, pollId, votes, publish);
  closePollInDb(pollId).catch((e) => logger.error("❌ Failed to close poll in DB", e));
  return poll;
}

// Export maps for migration phase
export { activePolls, sessionActivePoll };
