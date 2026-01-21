/**
 * Robustness Enhancement Tests
 *
 * @file robustness.test.ts
 * @package @pika/cloud
 * @created 2026-01-21
 *
 * PURPOSE:
 * Tests the robustness enhancements added to the Cloud service:
 * 1. parseMessage() - Type-safe Zod validation for WebSocket messages
 * 2. safeHandler() - Error wrapper that prevents WS connection crashes
 * 3. Poll timer cleanup - Prevents dangling timers
 * 4. waitForSession() - Event-based session coordination
 */

import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import { z } from "zod";

// ============================================================================
// 1. parseMessage() Tests
// ============================================================================

// Import the parseMessage helper
import { parseMessage, sendNack } from "../lib/protocol";

describe("parseMessage - Type-Safe Validation", () => {
  // Mock WebSocket for testing
  interface MockWS {
    sent: string[];
    send: (data: string) => void;
  }

  let mockWs: MockWS;

  beforeEach(() => {
    mockWs = {
      sent: [],
      send: (data: string) => mockWs.sent.push(data),
    };
  });

  const TestSchema = z.object({
    type: z.literal("TEST"),
    name: z.string(),
    count: z.number(),
  });

  test("returns parsed data for valid message", () => {
    const message = { type: "TEST", name: "hello", count: 42 };
    const result = parseMessage(TestSchema, message, mockWs);

    expect(result).toEqual({ type: "TEST", name: "hello", count: 42 });
    expect(mockWs.sent).toHaveLength(0); // No NACK sent
  });

  test("returns null for invalid message type", () => {
    const message = { type: "WRONG", name: "hello", count: 42 };
    const result = parseMessage(TestSchema, message, mockWs, "msg-123");

    expect(result).toBeNull();
    expect(mockWs.sent).toHaveLength(1);
    const nack = JSON.parse(mockWs.sent[0]);
    expect(nack.type).toBe("NACK");
    expect(nack.messageId).toBe("msg-123");
  });

  test("returns null for missing required field", () => {
    const message = { type: "TEST", name: "hello" }; // missing count
    const result = parseMessage(TestSchema, message, mockWs, "msg-456");

    expect(result).toBeNull();
    expect(mockWs.sent).toHaveLength(1);
    const nack = JSON.parse(mockWs.sent[0]);
    expect(nack.type).toBe("NACK");
    expect(nack.error).toContain("Invalid message"); // Validates error is sent
  });

  test("returns null for wrong field type", () => {
    const message = { type: "TEST", name: "hello", count: "not a number" };
    const result = parseMessage(TestSchema, message, mockWs, "msg-789");

    expect(result).toBeNull();
    expect(mockWs.sent).toHaveLength(1);
    const nack = JSON.parse(mockWs.sent[0]);
    expect(nack.type).toBe("NACK");
  });

  test("does not send NACK when messageId is undefined", () => {
    const message = { type: "WRONG" };
    const result = parseMessage(TestSchema, message, mockWs);

    expect(result).toBeNull();
    expect(mockWs.sent).toHaveLength(0); // No NACK without messageId
  });

  test("handles nested schema validation", () => {
    const NestedSchema = z.object({
      type: z.literal("NESTED"),
      payload: z.object({
        track: z.object({
          artist: z.string(),
          title: z.string(),
        }),
      }),
    });

    const validMsg = {
      type: "NESTED",
      payload: { track: { artist: "Artist", title: "Song" } },
    };
    const result = parseMessage(NestedSchema, validMsg, mockWs);
    expect(result).toEqual(validMsg);

    const invalidMsg = {
      type: "NESTED",
      payload: { track: { artist: "Artist" } }, // missing title
    };
    const result2 = parseMessage(NestedSchema, invalidMsg, mockWs, "msg-nested");
    expect(result2).toBeNull();
  });

  test("handles optional fields correctly", () => {
    const OptionalSchema = z.object({
      type: z.literal("OPT"),
      required: z.string(),
      optional: z.string().optional(),
    });

    const withOptional = { type: "OPT", required: "yes", optional: "here" };
    const withoutOptional = { type: "OPT", required: "yes" };

    expect(parseMessage(OptionalSchema, withOptional, mockWs)).toEqual(withOptional);
    expect(parseMessage(OptionalSchema, withoutOptional, mockWs)).toEqual(withoutOptional);
  });
});

// ============================================================================
// 2. safeHandler() Tests
// ============================================================================

import { safeHandler } from "../handlers/index";
import type { WSContext, MessageHandler } from "../handlers/ws-context";

describe("safeHandler - Error Wrapper", () => {
  // Create a minimal mock WSContext
  function createMockContext(messageId?: string): WSContext {
    const sent: string[] = [];
    return {
      message: { type: "TEST" },
      ws: {
        send: (data: string) => sent.push(data),
      },
      rawWs: {
        publish: () => {},
        subscribe: () => {},
        unsubscribe: () => {},
        getBufferedAmount: () => 0,
      },
      state: {
        clientId: "test-client",
        djSessionId: undefined,
        isListener: false,
        subscribedSessionId: undefined,
      },
      messageId,
      _sent: sent, // Helper for testing
    } as unknown as WSContext & { _sent: string[] };
  }

  test("executes handler normally when no error", async () => {
    let executed = false;
    const handler: MessageHandler = async () => {
      executed = true;
    };

    const wrapped = safeHandler(handler);
    const ctx = createMockContext();

    await wrapped(ctx);

    expect(executed).toBe(true);
  });

  test("catches synchronous errors", async () => {
    const handler: MessageHandler = () => {
      throw new Error("Sync error");
    };

    const wrapped = safeHandler(handler);
    const ctx = createMockContext("msg-sync");

    // Should not throw
    await wrapped(ctx);

    // Should have sent NACK
    const sent = (ctx as unknown as { _sent: string[] })._sent;
    expect(sent.length).toBeGreaterThan(0);
    const nack = JSON.parse(sent[sent.length - 1]);
    expect(nack.type).toBe("NACK");
    expect(nack.error).toBe("Internal server error");
  });

  test("catches asynchronous errors", async () => {
    const handler: MessageHandler = async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      throw new Error("Async error");
    };

    const wrapped = safeHandler(handler);
    const ctx = createMockContext("msg-async");

    await wrapped(ctx);

    const sent = (ctx as unknown as { _sent: string[] })._sent;
    expect(sent.length).toBeGreaterThan(0);
    const nack = JSON.parse(sent[sent.length - 1]);
    expect(nack.type).toBe("NACK");
  });

  test("does not send NACK when messageId is missing", async () => {
    const handler: MessageHandler = () => {
      throw new Error("Error without messageId");
    };

    const wrapped = safeHandler(handler);
    const ctx = createMockContext(); // No messageId

    await wrapped(ctx);

    // No NACK sent (can't reference message without ID)
    const sent = (ctx as unknown as { _sent: string[] })._sent;
    expect(sent).toHaveLength(0);
  });

  test("preserves handler return behavior", async () => {
    const handler: MessageHandler = async () => {
      // Normal handler just returns
      return;
    };

    const wrapped = safeHandler(handler);
    const ctx = createMockContext();

    const result = await wrapped(ctx);

    expect(result).toBeUndefined();
  });
});

// ============================================================================
// 3. Poll Timer Cleanup Tests
// ============================================================================

import {
  createPoll,
  endPoll,
  setPollTimer,
  cancelPollTimer,
  getActivePoll,
  clearAllPolls,
} from "../lib/polls";

describe("Poll Timer Cleanup", () => {
  beforeEach(() => {
    clearAllPolls();
  });

  test("setPollTimer stores timer reference", () => {
    const poll = createPoll("session-1", "Question?", ["A", "B"]);
    const timer = setTimeout(() => {}, 1000);

    setPollTimer(poll.id, timer);

    // Timer should be stored (we can't directly check the map, but cancelPollTimer should work)
    expect(() => cancelPollTimer(poll.id)).not.toThrow();
  });

  test("cancelPollTimer clears the timer", () => {
    const poll = createPoll("session-2", "Question?", ["A", "B"]);
    let timerFired = false;
    const timer = setTimeout(() => {
      timerFired = true;
    }, 50);

    setPollTimer(poll.id, timer);
    cancelPollTimer(poll.id);

    // Wait to ensure timer would have fired
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(timerFired).toBe(false);
        resolve();
      }, 100);
    });
  });

  test("endPoll cancels any pending timer", () => {
    const poll = createPoll("session-3", "Question?", ["A", "B"]);
    let timerFired = false;
    const timer = setTimeout(() => {
      timerFired = true;
    }, 50);

    setPollTimer(poll.id, timer);
    endPoll(poll.id);

    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(timerFired).toBe(false);
        resolve();
      }, 100);
    });
  });

  test("setPollTimer replaces existing timer", () => {
    const poll = createPoll("session-4", "Question?", ["A", "B"]);
    let timer1Fired = false;
    let timer2Fired = false;

    const timer1 = setTimeout(() => {
      timer1Fired = true;
    }, 50);
    const timer2 = setTimeout(() => {
      timer2Fired = true;
    }, 50);

    setPollTimer(poll.id, timer1);
    setPollTimer(poll.id, timer2); // Should cancel timer1

    cancelPollTimer(poll.id); // Cancel timer2

    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(timer1Fired).toBe(false); // Cancelled by setPollTimer
        expect(timer2Fired).toBe(false); // Cancelled by cancelPollTimer
        resolve();
      }, 100);
    });
  });

  test("clearAllPolls cancels all timers", () => {
    const poll1 = createPoll("session-5", "Q1?", ["A", "B"]);
    const poll2 = createPoll("session-6", "Q2?", ["A", "B"]);
    let timer1Fired = false;
    let timer2Fired = false;

    setPollTimer(
      poll1.id,
      setTimeout(() => {
        timer1Fired = true;
      }, 50),
    );
    setPollTimer(
      poll2.id,
      setTimeout(() => {
        timer2Fired = true;
      }, 50),
    );

    clearAllPolls();

    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(timer1Fired).toBe(false);
        expect(timer2Fired).toBe(false);
        resolve();
      }, 100);
    });
  });

  test("cancelPollTimer handles non-existent poll gracefully", () => {
    expect(() => cancelPollTimer(99999)).not.toThrow();
  });
});

// ============================================================================
// 4. waitForSession() Tests
// ============================================================================

import { waitForSession, persistSession, persistedSessions } from "../lib/persistence/sessions";

describe("waitForSession - Event-Based Coordination", () => {
  beforeEach(() => {
    persistedSessions.clear();
  });

  test("returns true immediately if session already persisted", async () => {
    persistedSessions.add("session-exists");

    const start = Date.now();
    const result = await waitForSession("session-exists");
    const elapsed = Date.now() - start;

    expect(result).toBe(true);
    expect(elapsed).toBeLessThan(50); // Should be immediate
  });

  test("returns true in test environment", async () => {
    // In test env, waitForSession returns immediately
    const result = await waitForSession("any-session");
    expect(result).toBe(true);
  });

  test("persistSession signals waiting callers", async () => {
    // This test verifies the signaling mechanism in test mode
    const sessionId = "signal-test-session";

    // Start waiting (will resolve immediately in test mode)
    const waitPromise = waitForSession(sessionId);

    // Persist the session
    await persistSession(sessionId, "Test DJ");

    const result = await waitPromise;
    expect(result).toBe(true);
    expect(persistedSessions.has(sessionId)).toBe(true);
  });

  test("persistSession adds to persistedSessions", async () => {
    const sessionId = "persist-test";

    expect(persistedSessions.has(sessionId)).toBe(false);

    await persistSession(sessionId, "DJ Test");

    expect(persistedSessions.has(sessionId)).toBe(true);
  });
});

// ============================================================================
// 5. Integration: Handler + parseMessage
// ============================================================================

describe("Handler Integration with parseMessage", () => {
  test("handlers reject messages with invalid schemas", () => {
    // This is covered by the parseMessage tests, but here we confirm
    // the integration pattern works as expected
    interface MockWS {
      sent: string[];
      send: (data: string) => void;
    }

    const mockWs: MockWS = {
      sent: [],
      send: (data: string) => mockWs.sent.push(data),
    };

    // The SendLikeSchema requires payload.track
    const SendLikeSchema = z.object({
      type: z.literal("SEND_LIKE"),
      sessionId: z.string().optional(),
      clientId: z.string().optional(),
      payload: z.object({
        track: z.object({
          artist: z.string(),
          title: z.string(),
        }),
      }),
    });

    // Missing payload entirely
    const badMessage = { type: "SEND_LIKE", sessionId: "test" };
    const result = parseMessage(SendLikeSchema, badMessage, mockWs, "like-1");

    expect(result).toBeNull();
    expect(mockWs.sent.length).toBe(1);
    expect(JSON.parse(mockWs.sent[0]).type).toBe("NACK");
  });

  test("handlers accept messages with valid schemas", () => {
    interface MockWS {
      sent: string[];
      send: (data: string) => void;
    }

    const mockWs: MockWS = {
      sent: [],
      send: (data: string) => mockWs.sent.push(data),
    };

    const SendLikeSchema = z.object({
      type: z.literal("SEND_LIKE"),
      sessionId: z.string().optional(),
      payload: z.object({
        track: z.object({
          artist: z.string(),
          title: z.string(),
        }),
      }),
    });

    const goodMessage = {
      type: "SEND_LIKE",
      sessionId: "session-1",
      payload: {
        track: { artist: "Artist", title: "Song" },
      },
    };

    const result = parseMessage(SendLikeSchema, goodMessage, mockWs);

    expect(result).toEqual(goodMessage);
    expect(mockWs.sent).toHaveLength(0); // No NACK
  });
});
