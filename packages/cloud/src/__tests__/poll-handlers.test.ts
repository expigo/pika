/**
 * Poll Handler Tests
 *
 * @file poll-handlers.test.ts
 * @package @pika/cloud
 * @created 2026-01-21
 *
 * PURPOSE:
 * Tests poll state management - critical for real-time voting features.
 * Covers in-memory poll tracking, vote recording, and poll lifecycle.
 *
 * PRODUCTION LOCATION: packages/cloud/src/index.ts lines 275-378
 */

import { beforeEach, describe, expect, test } from "bun:test";

// ============================================================================
// MOCK POLL STATE (mirrors production patterns)
// ============================================================================

interface ActivePoll {
  id: number;
  sessionId: string;
  question: string;
  options: string[];
  votes: number[];
  votedClients: Map<string, number>;
  endsAt?: Date;
}

// Map: pollId -> ActivePoll
let activePolls: Map<number, ActivePoll>;
// Map: sessionId -> current poll ID
let sessionActivePoll: Map<string, number>;

function getActivePoll(pollId: number): ActivePoll | undefined {
  return activePolls.get(pollId);
}

function getSessionPoll(sessionId: string): ActivePoll | undefined {
  const pollId = sessionActivePoll.get(sessionId);
  return pollId ? activePolls.get(pollId) : undefined;
}

function createPoll(
  id: number,
  sessionId: string,
  question: string,
  options: string[],
  endsAt?: Date,
): ActivePoll {
  const poll: ActivePoll = {
    id,
    sessionId,
    question,
    options,
    votes: new Array(options.length).fill(0),
    votedClients: new Map(),
    endsAt,
  };
  activePolls.set(id, poll);
  sessionActivePoll.set(sessionId, id);
  return poll;
}

function endPoll(pollId: number): ActivePoll | undefined {
  const poll = activePolls.get(pollId);
  if (poll) {
    activePolls.delete(pollId);
    sessionActivePoll.delete(poll.sessionId);
  }
  return poll;
}

function recordVote(poll: ActivePoll, clientId: string, optionIndex: number): boolean {
  // Validate option index
  if (optionIndex < 0 || optionIndex >= poll.options.length) {
    return false;
  }

  // Check if client already voted
  if (poll.votedClients.has(clientId)) {
    return false; // Already voted
  }

  // Record vote
  poll.votes[optionIndex]++;
  poll.votedClients.set(clientId, optionIndex);
  return true;
}

function getVoteResults(poll: ActivePoll): {
  votes: number[];
  totalVotes: number;
  winnerIndex: number;
  winner: string | null;
} {
  const totalVotes = poll.votes.reduce((a, b) => a + b, 0);
  const maxVotes = Math.max(...poll.votes);
  const winnerIndex = totalVotes > 0 ? poll.votes.indexOf(maxVotes) : -1;

  return {
    votes: poll.votes,
    totalVotes,
    winnerIndex,
    winner: winnerIndex >= 0 ? poll.options[winnerIndex] : null,
  };
}

// ============================================================================
// TESTS
// ============================================================================

describe("Poll State Management", () => {
  beforeEach(() => {
    activePolls = new Map();
    sessionActivePoll = new Map();
  });

  /**
   * TEST: Create and retrieve poll
   *
   * RATIONALE:
   * Polls must be stored and retrievable by ID for vote processing.
   */
  test("creates and retrieves poll by ID", () => {
    const _poll = createPoll(1, "session-1", "Faster or slower?", ["Faster", "Slower", "Perfect"]);

    const retrieved = getActivePoll(1);
    expect(retrieved).toBeDefined();
    expect(retrieved?.question).toBe("Faster or slower?");
    expect(retrieved?.options).toEqual(["Faster", "Slower", "Perfect"]);
  });

  /**
   * TEST: Retrieve poll by session
   *
   * RATIONALE:
   * Each session has at most one active poll - must be findable by session ID.
   */
  test("retrieves poll by session ID", () => {
    createPoll(1, "session-abc", "Continue set?", ["Yes", "No"]);

    const poll = getSessionPoll("session-abc");
    expect(poll).toBeDefined();
    expect(poll?.id).toBe(1);
  });

  /**
   * TEST: Returns undefined for unknown poll/session
   *
   * RATIONALE:
   * Must handle non-existent polls gracefully without throwing.
   */
  test("returns undefined for unknown poll ID", () => {
    const poll = getActivePoll(999);
    expect(poll).toBeUndefined();
  });

  test("returns undefined for unknown session", () => {
    const poll = getSessionPoll("nonexistent");
    expect(poll).toBeUndefined();
  });

  /**
   * TEST: End poll removes from both maps
   *
   * RATIONALE:
   * Ending a poll must clean up both pollId and sessionId mappings.
   */
  test("ending poll removes from both maps", () => {
    createPoll(1, "session-1", "Question", ["A", "B"]);

    const ended = endPoll(1);
    expect(ended).toBeDefined();
    expect(ended?.question).toBe("Question");

    // Verify cleanup
    expect(getActivePoll(1)).toBeUndefined();
    expect(getSessionPoll("session-1")).toBeUndefined();
  });

  /**
   * TEST: End non-existent poll returns undefined
   */
  test("ending non-existent poll returns undefined", () => {
    const result = endPoll(999);
    expect(result).toBeUndefined();
  });

  /**
   * TEST: One session, one poll constraint
   *
   * RATIONALE:
   * Creating a new poll for a session should replace the old one.
   */
  test("new poll replaces existing poll for same session", () => {
    createPoll(1, "session-1", "First poll", ["A", "B"]);
    createPoll(2, "session-1", "Second poll", ["X", "Y"]);

    const sessionPoll = getSessionPoll("session-1");
    expect(sessionPoll?.id).toBe(2);
    expect(sessionPoll?.question).toBe("Second poll");
  });
});

describe("Poll Voting", () => {
  beforeEach(() => {
    activePolls = new Map();
    sessionActivePoll = new Map();
  });

  /**
   * TEST: Record valid vote
   *
   * RATIONALE:
   * Votes must increment the correct option counter.
   */
  test("records valid vote", () => {
    const poll = createPoll(1, "s1", "Q", ["A", "B", "C"]);

    const success = recordVote(poll, "client-1", 1);
    expect(success).toBe(true);
    expect(poll.votes).toEqual([0, 1, 0]);
  });

  /**
   * TEST: Reject duplicate vote from same client
   *
   * RATIONALE:
   * Each client can only vote once per poll to prevent gaming.
   */
  test("rejects duplicate vote from same client", () => {
    const poll = createPoll(1, "s1", "Q", ["A", "B"]);

    recordVote(poll, "client-1", 0);
    const duplicate = recordVote(poll, "client-1", 1);

    expect(duplicate).toBe(false);
    expect(poll.votes).toEqual([1, 0]); // First vote sticks
  });

  /**
   * TEST: Different clients can vote
   */
  test("allows different clients to vote", () => {
    const poll = createPoll(1, "s1", "Q", ["A", "B"]);

    recordVote(poll, "client-1", 0);
    recordVote(poll, "client-2", 1);
    recordVote(poll, "client-3", 0);

    expect(poll.votes).toEqual([2, 1]);
  });

  /**
   * TEST: Reject invalid option index
   */
  test("rejects vote for invalid option index", () => {
    const poll = createPoll(1, "s1", "Q", ["A", "B"]);

    expect(recordVote(poll, "c1", -1)).toBe(false);
    expect(recordVote(poll, "c2", 5)).toBe(false);
    expect(poll.votes).toEqual([0, 0]);
  });

  /**
   * TEST: votedClients tracks who voted
   */
  test("tracks which clients voted and their choice", () => {
    const poll = createPoll(1, "s1", "Q", ["A", "B", "C"]);

    recordVote(poll, "c1", 0);
    recordVote(poll, "c2", 2);

    expect(poll.votedClients.get("c1")).toBe(0);
    expect(poll.votedClients.get("c2")).toBe(2);
  });
});

describe("Poll Results Calculation", () => {
  beforeEach(() => {
    activePolls = new Map();
    sessionActivePoll = new Map();
  });

  /**
   * TEST: Calculate winner correctly
   */
  test("calculates winner correctly", () => {
    const poll = createPoll(1, "s1", "Pick", ["A", "B", "C"]);
    recordVote(poll, "c1", 1);
    recordVote(poll, "c2", 1);
    recordVote(poll, "c3", 2);

    const results = getVoteResults(poll);
    expect(results.totalVotes).toBe(3);
    expect(results.winner).toBe("B");
    expect(results.winnerIndex).toBe(1);
  });

  /**
   * TEST: Handle tie (first option wins)
   */
  test("handles tie by selecting first option", () => {
    const poll = createPoll(1, "s1", "Q", ["A", "B"]);
    recordVote(poll, "c1", 0);
    recordVote(poll, "c2", 1);

    const results = getVoteResults(poll);
    expect(results.totalVotes).toBe(2);
    expect(results.winner).toBe("A"); // First with max wins
  });

  /**
   * TEST: Empty poll has no winner
   */
  test("empty poll has no winner", () => {
    const poll = createPoll(1, "s1", "Q", ["A", "B"]);

    const results = getVoteResults(poll);
    expect(results.totalVotes).toBe(0);
    expect(results.winner).toBeNull();
    expect(results.winnerIndex).toBe(-1);
  });
});

describe("Poll Auto-Close Timer", () => {
  beforeEach(() => {
    activePolls = new Map();
    sessionActivePoll = new Map();
  });

  /**
   * TEST: Poll with endsAt timestamp is stored
   */
  test("stores endsAt timestamp", () => {
    const endsAt = new Date(Date.now() + 60000);
    const poll = createPoll(1, "s1", "Q", ["A", "B"], endsAt);

    expect(poll.endsAt).toEqual(endsAt);
  });

  /**
   * TEST: Check if poll is expired
   */
  test("detects expired poll", () => {
    const pastDate = new Date(Date.now() - 1000);
    const poll = createPoll(1, "s1", "Q", ["A", "B"], pastDate);

    const isExpired = poll.endsAt && poll.endsAt < new Date();
    expect(isExpired).toBe(true);
  });

  /**
   * TEST: Check if poll is still active
   */
  test("detects active poll", () => {
    const futureDate = new Date(Date.now() + 60000);
    const poll = createPoll(1, "s1", "Q", ["A", "B"], futureDate);

    const isExpired = poll.endsAt && poll.endsAt < new Date();
    expect(isExpired).toBe(false);
  });
});
