/**
 * ACK registry tests
 *
 * @file ackRegistry.test.ts
 * @package @pika/web
 *
 * PURPOSE:
 * Covers the async-coordination logic behind the ACK-gated offline-like flush (W1):
 * ACK resolves the waiter, NACK/timeout resolve false, unknown ids are no-ops, and
 * batch subtraction removes exactly the flushed likes.
 *
 * NOTE: Run with `bun test` from packages/web.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  clearAllAcks,
  filterOutFlushed,
  generateMessageId,
  pendingLikeId,
  resolveAck,
  waitForAck,
} from "./ackRegistry";

beforeEach(() => clearAllAcks());
afterEach(() => clearAllAcks());

describe("waitForAck / resolveAck", () => {
  test("resolves true when ACKed before the timeout", async () => {
    const p = waitForAck("a", 1000);
    resolveAck("a", true);
    expect(await p).toBe(true);
  });

  test("resolves false on NACK", async () => {
    const p = waitForAck("b", 1000);
    resolveAck("b", false);
    expect(await p).toBe(false);
  });

  test("resolves false on timeout with no response", async () => {
    expect(await waitForAck("c", 10)).toBe(false);
  });

  test("resolveAck for an unknown id is a no-op (no throw)", () => {
    expect(() => resolveAck("never-registered", true)).not.toThrow();
  });

  test("a late ACK after timeout is ignored", async () => {
    expect(await waitForAck("d", 10)).toBe(false);
    // Arrives after the waiter already timed out and was cleaned up.
    expect(() => resolveAck("d", true)).not.toThrow();
  });
});

describe("generateMessageId", () => {
  test("returns unique, non-empty ids", () => {
    const a = generateMessageId();
    const b = generateMessageId();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThan(0);
  });
});

describe("filterOutFlushed", () => {
  const t1 = { track: { artist: "A", title: "One" }, timestamp: 1 };
  const t2 = { track: { artist: "B", title: "Two" }, timestamp: 2 };
  const t3 = { track: { artist: "C", title: "Three" }, timestamp: 3 };

  test("removes exactly the flushed batch", () => {
    const flushed = new Set([pendingLikeId(t1), pendingLikeId(t2)]);
    expect(filterOutFlushed([t1, t2, t3], flushed)).toEqual([t3]);
  });

  test("preserves a like enqueued during the in-flight await", () => {
    // Batch was [t1]; t2 queued while the ACK was pending → must survive the clear.
    const flushed = new Set([pendingLikeId(t1)]);
    expect(filterOutFlushed([t1, t2], flushed)).toEqual([t2]);
  });

  test("same track liked at a different time is a distinct entry", () => {
    const t1Again = { track: { artist: "A", title: "One" }, timestamp: 99 };
    const flushed = new Set([pendingLikeId(t1)]);
    expect(filterOutFlushed([t1, t1Again], flushed)).toEqual([t1Again]);
  });
});
