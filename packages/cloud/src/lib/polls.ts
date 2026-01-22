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

// Auto-increment poll ID
let nextPollId = 1;

// ============================================================================
// Timer Management
// ============================================================================

/**
 * Set an auto-end timer for a poll
 */
export function setPollTimer(pollId: number, timer: Timer): void {
  // Clear any existing timer first
  cancelPollTimer(pollId);
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
    console.log(`⏰ Cleared auto-end timer for poll ${pollId}`);
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
 * Create a new poll for a session
 * @returns the new poll ID, or null if session already has an active poll
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

// Export maps for migration phase
export { activePolls, sessionActivePoll };

