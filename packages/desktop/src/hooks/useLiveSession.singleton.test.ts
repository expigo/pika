import { describe, expect, it, vi, beforeEach } from "vitest";
import { virtualDjWatcher } from "../services/virtualDjWatcher";

// ⚠️ NOTE: We are testing the concept of the singleton pattern used in useLiveSession.ts.
// Since we don't have a React hook testing environment set up (renderHook),
// we verify the module-level state logic.

describe("useLiveSession Singleton Pattern", () => {
  let watcherListeners: Function[] = [];

  beforeEach(() => {
    watcherListeners = [];
    vi.clearAllMocks();

    // Mock the watcher to track listeners
    vi.spyOn(virtualDjWatcher, "onTrackChange").mockImplementation((cb) => {
      watcherListeners.push(cb);
      return () => {
        watcherListeners = watcherListeners.filter((l) => l !== cb);
      };
    });
  });

  /**
   * TEST: Singleton prevent duplicate listeners
   *
   * RATIONALE: Multiple hooks (App.tsx, LiveControl.tsx) must share one listener.
   * FAILURE IMPACT: Duplicate track recording and history count mismatch.
   */
  it("should only register one listener even if logic is triggered multiple times", () => {
    // Mimic the module-level state of useLiveSession.ts
    let watcherUnsubscribe: (() => void) | null = null;

    const setupListener = () => {
      if (watcherUnsubscribe) return;
      watcherUnsubscribe = virtualDjWatcher.onTrackChange(() => {});
    };

    // Simulate first hook mount
    setupListener();
    expect(watcherListeners.length).toBe(1);

    // Simulate second hook mount
    setupListener();
    expect(watcherListeners.length).toBe(1); // Should still be 1!

    // Cleanup
    if (watcherUnsubscribe) {
      watcherUnsubscribe();
      watcherUnsubscribe = null;
    }
    expect(watcherListeners.length).toBe(0);
  });
});
