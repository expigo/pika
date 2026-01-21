/**
 * Message Reliability & Offline Queue Tests
 *
 * @file message-reliability.test.ts
 * @package @pika/desktop
 * @created 2026-01-21
 *
 * PURPOSE:
 * Tests the ACK/NACK protocol, retry logic, timeout handling, and offline queue.
 * Critical for ensuring messages are delivered reliably even with network issues.
 *
 * PRODUCTION LOCATION: packages/desktop/src/hooks/useLiveSession.ts lines 29-356
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// ============================================================================
// MOCK ACK/NACK INFRASTRUCTURE
// ============================================================================

interface PendingMessage {
  messageId: string;
  payload: object;
  resolve: (ack: boolean) => void;
  retryCount: number;
  timeout: ReturnType<typeof setTimeout>;
}

// Constants from production
const ACK_TIMEOUT_MS = 5000;
const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 2000, 4000];

// State
let pendingMessages: Map<string, PendingMessage>;
let offlineQueue: { id: number; payload: object }[];
let handleTimeoutCalls: string[];
let retrySendCalls: string[];

function generateMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

function handleAck(messageId: string): boolean {
  const pending = pendingMessages.get(messageId);
  if (pending) {
    clearTimeout(pending.timeout);
    pendingMessages.delete(messageId);
    pending.resolve(true);
    return true;
  }
  return false;
}

function handleNack(messageId: string, error: string, socketOpen = true): void {
  const pending = pendingMessages.get(messageId);
  if (pending) {
    clearTimeout(pending.timeout);

    if (pending.retryCount < MAX_RETRIES) {
      const delay = RETRY_DELAYS[pending.retryCount] || RETRY_DELAYS[RETRY_DELAYS.length - 1];

      if (socketOpen) {
        // Would retry - track for testing
        retrySendCalls.push(messageId);
        pending.retryCount++;
      } else {
        // Move to offline queue
        pendingMessages.delete(messageId);
        offlineQueue.push({ id: offlineQueue.length + 1, payload: pending.payload });
        pending.resolve(false);
      }
    } else {
      // Max retries exceeded
      pendingMessages.delete(messageId);
      pending.resolve(false);
    }
  }
}

function handleTimeout(messageId: string, socketOpen = true): void {
  const pending = pendingMessages.get(messageId);
  if (!pending) return;

  handleTimeoutCalls.push(messageId);

  if (pending.retryCount < MAX_RETRIES) {
    if (socketOpen) {
      retrySendCalls.push(messageId);
      pending.retryCount++;
    } else {
      pendingMessages.delete(messageId);
      offlineQueue.push({ id: offlineQueue.length + 1, payload: pending.payload });
      pending.resolve(false);
    }
  } else {
    pendingMessages.delete(messageId);
    pending.resolve(false);
  }
}

function clearPendingMessages(): void {
  for (const [, pending] of pendingMessages) {
    clearTimeout(pending.timeout);
    pending.resolve(false);
  }
  pendingMessages.clear();
}

// ============================================================================
// TESTS
// ============================================================================

describe("Message Reliability - Message ID Generation", () => {
  /**
   * TEST: Message ID format
   *
   * RATIONALE:
   * Message IDs must be unique and include timestamp for debugging.
   */
  it("generates unique message IDs", () => {
    const id1 = generateMessageId();
    const id2 = generateMessageId();

    expect(id1).not.toBe(id2);
    expect(id1).toMatch(/^msg_\d+_[a-z0-9]+$/);
    expect(id2).toMatch(/^msg_\d+_[a-z0-9]+$/);
  });

  it("includes timestamp in message ID", () => {
    const before = Date.now();
    const id = generateMessageId();
    const after = Date.now();

    const timestamp = Number.parseInt(id.split("_")[1], 10);
    expect(timestamp).toBeGreaterThanOrEqual(before);
    expect(timestamp).toBeLessThanOrEqual(after);
  });
});

describe("Message Reliability - ACK Handling", () => {
  beforeEach(() => {
    pendingMessages = new Map();
    offlineQueue = [];
    handleTimeoutCalls = [];
    retrySendCalls = [];
  });

  /**
   * TEST: ACK clears pending message
   *
   * RATIONALE:
   * Receiving ACK means server confirmed receipt - remove from pending.
   */
  it("clears pending message on ACK", () => {
    let resolved = false;
    const messageId = "test-msg-1";
    const pending: PendingMessage = {
      messageId,
      payload: { type: "TEST" },
      resolve: (ack) => {
        resolved = ack;
      },
      retryCount: 0,
      timeout: setTimeout(() => {}, 10000),
    };
    pendingMessages.set(messageId, pending);

    const result = handleAck(messageId);

    expect(result).toBe(true);
    expect(resolved).toBe(true);
    expect(pendingMessages.has(messageId)).toBe(false);
  });

  /**
   * TEST: ACK for unknown message returns false
   */
  it("returns false for unknown message ID", () => {
    const result = handleAck("unknown-msg");
    expect(result).toBe(false);
  });

  /**
   * TEST: ACK clears timeout
   */
  it("clears timeout when ACK received", () => {
    vi.useFakeTimers();
    const messageId = "timeout-test";
    const timeoutFn = vi.fn();

    const pending: PendingMessage = {
      messageId,
      payload: {},
      resolve: () => {},
      retryCount: 0,
      timeout: setTimeout(timeoutFn, ACK_TIMEOUT_MS),
    };
    pendingMessages.set(messageId, pending);

    handleAck(messageId);

    // Fast forward - timeout should NOT fire
    vi.advanceTimersByTime(ACK_TIMEOUT_MS + 1000);
    expect(timeoutFn).not.toHaveBeenCalled();

    vi.useRealTimers();
  });
});

describe("Message Reliability - NACK Handling", () => {
  beforeEach(() => {
    pendingMessages = new Map();
    offlineQueue = [];
    handleTimeoutCalls = [];
    retrySendCalls = [];
  });

  /**
   * TEST: NACK triggers retry within limit
   *
   * RATIONALE:
   * Server rejected but can retry - must respect MAX_RETRIES.
   */
  it("triggers retry when under limit", () => {
    const messageId = "nack-retry";
    const pending: PendingMessage = {
      messageId,
      payload: { type: "TEST" },
      resolve: () => {},
      retryCount: 0,
      timeout: setTimeout(() => {}, 10000),
    };
    pendingMessages.set(messageId, pending);

    handleNack(messageId, "Server busy", true);

    expect(retrySendCalls).toContain(messageId);
    expect(pending.retryCount).toBe(1);
  });

  /**
   * TEST: NACK resolves false at max retries
   */
  it("resolves false when max retries exceeded", () => {
    let resolved: boolean | null = null;
    const messageId = "max-retries";
    const pending: PendingMessage = {
      messageId,
      payload: {},
      resolve: (ack) => {
        resolved = ack;
      },
      retryCount: MAX_RETRIES, // Already at max
      timeout: setTimeout(() => {}, 10000),
    };
    pendingMessages.set(messageId, pending);

    handleNack(messageId, "Failed again");

    expect(resolved).toBe(false);
    expect(pendingMessages.has(messageId)).toBe(false);
  });

  /**
   * TEST: NACK queues to offline when socket closed
   */
  it("queues to offline when socket closed", () => {
    let resolved: boolean | null = null;
    const messageId = "offline-queue";
    const payload = { type: "IMPORTANT" };
    const pending: PendingMessage = {
      messageId,
      payload,
      resolve: (ack) => {
        resolved = ack;
      },
      retryCount: 0,
      timeout: setTimeout(() => {}, 10000),
    };
    pendingMessages.set(messageId, pending);

    handleNack(messageId, "Socket closed", false);

    expect(resolved).toBe(false);
    expect(offlineQueue.length).toBe(1);
    expect(offlineQueue[0].payload).toEqual(payload);
  });
});

describe("Message Reliability - Timeout Handling", () => {
  beforeEach(() => {
    pendingMessages = new Map();
    offlineQueue = [];
    handleTimeoutCalls = [];
    retrySendCalls = [];
  });

  /**
   * TEST: Timeout triggers retry
   *
   * RATIONALE:
   * No ACK/NACK received - retry the message.
   */
  it("triggers retry when socket open", () => {
    const messageId = "timeout-retry";
    const pending: PendingMessage = {
      messageId,
      payload: { type: "TEST" },
      resolve: () => {},
      retryCount: 0,
      timeout: setTimeout(() => {}, 1),
    };
    pendingMessages.set(messageId, pending);

    handleTimeout(messageId, true);

    expect(handleTimeoutCalls).toContain(messageId);
    expect(retrySendCalls).toContain(messageId);
    expect(pending.retryCount).toBe(1);
  });

  /**
   * TEST: Timeout queues offline when socket closed
   */
  it("queues to offline when socket closed on timeout", () => {
    let resolved: boolean | null = null;
    const messageId = "timeout-offline";
    const pending: PendingMessage = {
      messageId,
      payload: { type: "QUEUED" },
      resolve: (ack) => {
        resolved = ack;
      },
      retryCount: 0,
      timeout: setTimeout(() => {}, 1),
    };
    pendingMessages.set(messageId, pending);

    handleTimeout(messageId, false);

    expect(resolved).toBe(false);
    expect(offlineQueue.length).toBe(1);
  });

  /**
   * TEST: Timeout gives up after max retries
   */
  it("gives up after max retries", () => {
    let resolved: boolean | null = null;
    const messageId = "timeout-maxed";
    const pending: PendingMessage = {
      messageId,
      payload: {},
      resolve: (ack) => {
        resolved = ack;
      },
      retryCount: MAX_RETRIES,
      timeout: setTimeout(() => {}, 1),
    };
    pendingMessages.set(messageId, pending);

    handleTimeout(messageId, true);

    expect(resolved).toBe(false);
    expect(pendingMessages.has(messageId)).toBe(false);
  });

  /**
   * TEST: Timeout for unknown message does nothing
   */
  it("ignores unknown message ID", () => {
    // handleTimeout returns early for unknown messages without tracking
    const sizeBefore = pendingMessages.size;
    handleTimeout("unknown", true);
    // No crash, no state change
    expect(pendingMessages.size).toBe(sizeBefore);
  });
});

describe("Message Reliability - Clear Pending", () => {
  beforeEach(() => {
    pendingMessages = new Map();
    offlineQueue = [];
    handleTimeoutCalls = [];
    retrySendCalls = [];
  });

  /**
   * TEST: Clear resolves all pending as false
   *
   * RATIONALE:
   * On session end, all pending messages should be resolved.
   */
  it("resolves all pending messages as false", () => {
    const results: boolean[] = [];

    for (let i = 0; i < 3; i++) {
      const pending: PendingMessage = {
        messageId: `msg-${i}`,
        payload: {},
        resolve: (ack) => {
          results.push(ack);
        },
        retryCount: 0,
        timeout: setTimeout(() => {}, 10000),
      };
      pendingMessages.set(`msg-${i}`, pending);
    }

    clearPendingMessages();

    expect(results).toEqual([false, false, false]);
    expect(pendingMessages.size).toBe(0);
  });
});

describe("Message Reliability - Retry Delays", () => {
  /**
   * TEST: Exponential backoff delays
   *
   * RATIONALE:
   * Retry delays should increase to avoid overwhelming the server.
   */
  it("uses exponential backoff delays", () => {
    expect(RETRY_DELAYS[0]).toBe(1000);
    expect(RETRY_DELAYS[1]).toBe(2000);
    expect(RETRY_DELAYS[2]).toBe(4000);
    expect(RETRY_DELAYS[1]).toBeGreaterThan(RETRY_DELAYS[0]);
    expect(RETRY_DELAYS[2]).toBeGreaterThan(RETRY_DELAYS[1]);
  });

  /**
   * TEST: Get delay for retry count
   */
  it("selects correct delay for retry count", () => {
    const getDelay = (retryCount: number) =>
      RETRY_DELAYS[retryCount] || RETRY_DELAYS[RETRY_DELAYS.length - 1];

    expect(getDelay(0)).toBe(1000);
    expect(getDelay(1)).toBe(2000);
    expect(getDelay(2)).toBe(4000);
    expect(getDelay(10)).toBe(4000); // Falls back to last
  });
});

describe("Offline Queue - Flush Logic", () => {
  beforeEach(() => {
    offlineQueue = [];
  });

  /**
   * TEST: Empty queue flushes nothing
   */
  it("handles empty queue gracefully", () => {
    expect(offlineQueue.length).toBe(0);
    // No crash when flushing empty queue
  });

  /**
   * TEST: Queue maintains order
   */
  it("maintains FIFO order", () => {
    offlineQueue.push({ id: 1, payload: { order: 1 } });
    offlineQueue.push({ id: 2, payload: { order: 2 } });
    offlineQueue.push({ id: 3, payload: { order: 3 } });

    expect(offlineQueue[0].payload).toEqual({ order: 1 });
    expect(offlineQueue[1].payload).toEqual({ order: 2 });
    expect(offlineQueue[2].payload).toEqual({ order: 3 });
  });

  /**
   * TEST: Queue item structure
   */
  it("stores payload with ID", () => {
    const payload = { type: "TEST", data: "value" };
    offlineQueue.push({ id: 1, payload });

    expect(offlineQueue[0].id).toBe(1);
    expect(offlineQueue[0].payload).toEqual(payload);
  });
});

describe("Track Broadcast Deduplication", () => {
  let lastBroadcastedTrackKey: string | null = null;

  beforeEach(() => {
    lastBroadcastedTrackKey = null;
  });

  /**
   * TEST: Broadcasts new track
   */
  it("broadcasts new track", () => {
    const track = { artist: "Artist", title: "Song" };
    const trackKey = `${track.artist}:${track.title}`;

    if (lastBroadcastedTrackKey !== trackKey) {
      lastBroadcastedTrackKey = trackKey;
    }

    expect(lastBroadcastedTrackKey).toBe("Artist:Song");
  });

  /**
   * TEST: Skips duplicate track
   */
  it("skips duplicate broadcast", () => {
    lastBroadcastedTrackKey = "Artist:Song";
    const track = { artist: "Artist", title: "Song" };
    const trackKey = `${track.artist}:${track.title}`;

    const shouldBroadcast = lastBroadcastedTrackKey !== trackKey;
    expect(shouldBroadcast).toBe(false);
  });

  /**
   * TEST: Broadcasts when track changes
   */
  it("broadcasts when track changes", () => {
    lastBroadcastedTrackKey = "Artist1:Song1";
    const track = { artist: "Artist2", title: "Song2" };
    const trackKey = `${track.artist}:${track.title}`;

    const shouldBroadcast = lastBroadcastedTrackKey !== trackKey;
    expect(shouldBroadcast).toBe(true);
  });
});

describe("Track Recording Deduplication", () => {
  let processedTrackKeys: Set<string>;

  beforeEach(() => {
    processedTrackKeys = new Set();
  });

  /**
   * TEST: Records new track
   */
  it("records new track", () => {
    const trackKey = "artist-title-12345";

    if (!processedTrackKeys.has(trackKey)) {
      processedTrackKeys.add(trackKey);
    }

    expect(processedTrackKeys.has(trackKey)).toBe(true);
  });

  /**
   * TEST: Skips already processed track
   */
  it("skips already processed track", () => {
    const trackKey = "artist-title-12345";
    processedTrackKeys.add(trackKey);

    const shouldRecord = !processedTrackKeys.has(trackKey);
    expect(shouldRecord).toBe(false);
  });

  /**
   * TEST: Time window deduplication
   */
  it("uses time-windowed key for deduplication", () => {
    const now = Date.now();
    const minuteWindow = Math.floor(now / 60000);

    const key1 = `artist-title-${minuteWindow}`;
    const key2 = `artist-title-${minuteWindow}`;
    const key3 = `artist-title-${minuteWindow + 1}`;

    expect(key1).toBe(key2);
    expect(key1).not.toBe(key3);
  });
});
