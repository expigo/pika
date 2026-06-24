/**
 * handleStartPoll concurrency guard (#10).
 *
 * The rejection path runs entirely before createPollInDb, so this is a pure unit test
 * (no DB). The happy-path create is covered by db.integration.test.ts "poll lifecycle"
 * and the lib/polls unit tests in poll-handlers.test.ts.
 */
import { beforeEach, describe, expect, it, mock } from "bun:test";
import { MESSAGE_TYPES } from "@pika/shared";
import { handleStartPoll } from "../handlers/poll";
import type { WSContext } from "../handlers/ws-context";
import { activePolls, clearAllPolls, sessionActivePoll } from "../lib/polls";
import { deleteSession, getAllSessions, setSession } from "../lib/sessions";

// biome-ignore lint/suspicious/noExplicitAny: minimal test double
const mockWs = { send: mock(() => {}) } as any;
// biome-ignore lint/suspicious/noExplicitAny: minimal test double
const mockRawWs = { publish: mock(() => {}), getBufferedAmount: mock(() => 0) } as any;

function setupSession(sessionId: string) {
  setSession(sessionId, {
    sessionId,
    djName: "DJ",
    startedAt: new Date().toISOString(),
    lastActivityAt: new Date().toISOString(),
  });
}

function startPollCtx(sessionId: string): WSContext {
  return {
    message: {
      type: MESSAGE_TYPES.START_POLL,
      sessionId,
      question: "Genre?",
      options: ["Blues", "Pop"],
    },
    ws: mockWs,
    rawWs: mockRawWs,
    state: { clientId: "dj", isListener: false, subscribedSessionId: null, djSessionId: sessionId },
    messageId: "poll-msg",
  } as unknown as WSContext;
}

const lastSend = () => JSON.parse(mockWs.send.mock.lastCall[0]);

beforeEach(() => {
  clearAllPolls();
  for (const s of getAllSessions()) deleteSession(s.sessionId);
  mockWs.send.mockClear();
  mockRawWs.publish.mockClear();
});

describe("handleStartPoll — one active poll per session (#10)", () => {
  it("rejects a second START_POLL while a poll is active, leaving the first untouched", async () => {
    const sid = "session_poll_concurrency";
    setupSession(sid);

    // Seed an active poll, as createPollInDb + the handler would have.
    const existingId = 99;
    sessionActivePoll.set(sid, existingId);
    activePolls.set(existingId, {
      id: existingId,
      sessionId: sid,
      question: "First?",
      options: ["A", "B"],
      votes: [0, 0],
      votedClients: new Map(),
    });
    const sizeBefore = activePolls.size;

    await handleStartPoll(startPollCtx(sid));

    // NACK, no broadcast, original poll + mapping unchanged (no DB hit, no orphan/timer).
    expect(mockRawWs.publish).not.toHaveBeenCalled();
    const sent = lastSend();
    expect(sent.type).toBe("NACK");
    expect(sent.error).toContain("already active");
    expect(sessionActivePoll.get(sid)).toBe(existingId);
    expect(activePolls.has(existingId)).toBe(true);
    expect(activePolls.size).toBe(sizeBefore);
  });
});
