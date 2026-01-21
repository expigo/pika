/**
 * Reaction Subscription Tests
 *
 * @file reaction-subscription.test.ts
 * @package @pika/desktop
 * @created 2026-01-21
 *
 * PURPOSE:
 * Tests the subscribeToReactions callback registration system.
 *
 * PRODUCTION LOCATION:
 * - subscribeToReactions: useLiveSession.ts line 205-210
 */

import { describe, test, expect, beforeEach } from "vitest";

// ============================================================================
// MOCK: Reaction Subscription System
// ============================================================================

type ReactionCallback = (reaction: { type: string; sessionId?: string }) => void;

let reactionCallbacks: Set<ReactionCallback>;

function subscribeToReactions(callback: ReactionCallback): () => void {
  reactionCallbacks.add(callback);
  return () => {
    reactionCallbacks.delete(callback);
  };
}

function notifyReactionListeners(reaction: { type: string; sessionId?: string }): void {
  reactionCallbacks.forEach((callback) => callback(reaction));
}

// ============================================================================
// TESTS
// ============================================================================

describe("subscribeToReactions", () => {
  beforeEach(() => {
    reactionCallbacks = new Set();
  });

  /**
   * TEST: Registers callback
   *
   * RATIONALE:
   * Callback must be stored so reactions can be dispatched.
   */
  test("registers callback", () => {
    const callback = () => {};
    subscribeToReactions(callback);

    expect(reactionCallbacks.size).toBe(1);
  });

  /**
   * TEST: Returns unsubscribe function
   */
  test("returns unsubscribe function", () => {
    const callback = () => {};
    const unsubscribe = subscribeToReactions(callback);

    expect(typeof unsubscribe).toBe("function");
  });

  /**
   * TEST: Unsubscribe removes callback
   */
  test("unsubscribe removes callback", () => {
    const callback = () => {};
    const unsubscribe = subscribeToReactions(callback);

    unsubscribe();

    expect(reactionCallbacks.size).toBe(0);
  });

  /**
   * TEST: Multiple subscribers work independently
   */
  test("multiple subscribers work independently", () => {
    const results: string[] = [];

    const unsub1 = subscribeToReactions((r) => results.push(`sub1:${r.type}`));
    const unsub2 = subscribeToReactions((r) => results.push(`sub2:${r.type}`));

    notifyReactionListeners({ type: "thank_you" });

    expect(results).toContain("sub1:thank_you");
    expect(results).toContain("sub2:thank_you");

    // Unsubscribe one
    unsub1();
    results.length = 0;

    notifyReactionListeners({ type: "heart" });

    expect(results).toEqual(["sub2:heart"]);
    unsub2();
  });

  /**
   * TEST: Callbacks receive reaction data
   */
  test("callbacks receive reaction data", () => {
    let receivedReaction: { type: string; sessionId?: string } | null = null;

    subscribeToReactions((r) => {
      receivedReaction = r;
    });

    notifyReactionListeners({ type: "thank_you", sessionId: "session-1" });

    expect(receivedReaction).toEqual({ type: "thank_you", sessionId: "session-1" });
  });

  /**
   * TEST: No error when notifying with no subscribers
   */
  test("no error when notifying with no subscribers", () => {
    expect(() => {
      notifyReactionListeners({ type: "test" });
    }).not.toThrow();
  });
});
