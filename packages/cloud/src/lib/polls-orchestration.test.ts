/**
 * Unit coverage for the shared poll orchestration (startPollForSession / endPollForSession).
 * The happy-path CREATE in startPollForSession hits Postgres, so it's covered in the gated
 * db.integration suite; here we cover the DB-free validation guards + the full end/cancel fan-out
 * with real in-memory poll state and a capturing publish spy.
 */
import { afterEach, describe, expect, test } from "bun:test";
import {
  type ActivePoll,
  activePolls,
  clearAllPolls,
  endPollForSession,
  sessionActivePoll,
  startPollForSession,
} from "./polls";
import { deleteSession, setSession } from "./sessions";

const SID = "session_test_poll_orch";

function makePublishSpy() {
  const calls: Array<Record<string, unknown>> = [];
  const publish = (_topic: string, data: string) => {
    calls.push(JSON.parse(data) as Record<string, unknown>);
  };
  return { calls, publish };
}

function seedPoll(votes: number[]): ActivePoll {
  const poll: ActivePoll = {
    id: 4242,
    sessionId: SID,
    question: "Genre?",
    options: votes.map((_, i) => `Opt${i}`),
    votes: [...votes],
    votedClients: new Map(),
  };
  activePolls.set(poll.id, poll);
  sessionActivePoll.set(SID, poll.id);
  return poll;
}

afterEach(() => {
  clearAllPolls();
  deleteSession(SID);
});

describe("startPollForSession — validation guards (no DB)", () => {
  const { publish, calls } = makePublishSpy();

  test("rejects fewer than 2 options", async () => {
    const r = await startPollForSession(
      { sessionId: SID, question: "Q", options: ["only"] },
      publish,
    );
    expect(r.ok).toBe(false);
    expect(r.error).toContain("2-10 options");
    expect(calls).toHaveLength(0);
  });

  test("rejects an empty / overlong option", async () => {
    const r = await startPollForSession(
      { sessionId: SID, question: "Q", options: ["A", ""] },
      publish,
    );
    expect(r.ok).toBe(false);
    expect(r.error).toContain("1-100 characters");
  });

  test("rejects when a poll is already active for the session", async () => {
    seedPoll([0, 0]);
    const r = await startPollForSession(
      { sessionId: SID, question: "Q", options: ["A", "B"] },
      publish,
    );
    expect(r.ok).toBe(false);
    expect(r.error).toContain("already active");
  });
});

describe("endPollForSession", () => {
  test("broadcasts POLL_ENDED with the winner and removes the poll", () => {
    setSession(SID, {
      sessionId: SID,
      djName: "DJ",
      startedAt: new Date().toISOString(),
      lastActivityAt: new Date().toISOString(),
    });
    const poll = seedPoll([1, 3, 0]);
    const { calls, publish } = makePublishSpy();

    const ended = endPollForSession(poll.id, publish);

    expect(ended?.id).toBe(poll.id);
    expect(activePolls.has(poll.id)).toBe(false);
    expect(sessionActivePoll.has(SID)).toBe(false);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      type: "POLL_ENDED",
      pollId: poll.id,
      results: [1, 3, 0],
      totalVotes: 4,
      winnerIndex: 1,
    });
  });

  test("cancelled end zeroes results and reports no winner", () => {
    const poll = seedPoll([2, 5]);
    const { calls, publish } = makePublishSpy();

    endPollForSession(poll.id, publish, { cancelled: true });

    expect(calls[0]).toMatchObject({
      type: "POLL_ENDED",
      results: [0, 0],
      totalVotes: 0,
      winnerIndex: -1,
    });
  });

  test("returns undefined and publishes nothing when the poll is gone", () => {
    const { calls, publish } = makePublishSpy();
    expect(endPollForSession(999, publish)).toBeUndefined();
    expect(calls).toHaveLength(0);
  });
});
