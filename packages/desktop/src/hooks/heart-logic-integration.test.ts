/**
 * Heart Logic Integration Test
 *
 * @file heart-logic-integration.test.ts
 * @package @pika/desktop
 *
 * PURPOSE:
 * Verifies the end-to-end flow of like/unlike messages in the DJ app:
 * 1. Store updates (increment/decrement)
 * 2. Debounced database count updates
 * 3. Track matching logic
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useLiveStore } from "./useLiveStore";

// Mocking the behavior of handleLikeReceivedCallback and handleLikeRemovedCallback
// as defined in useLiveSession.ts

// Simulated state for debounced storage (from useLiveSession.ts)
const pendingLikesByPlayId = new Map<number, number>();
const LIKE_STORAGE_DEBOUNCE_MS = 2000;
let likeStorageTimer: ReturnType<typeof setTimeout> | null = null;
let flushedCount = 0;

async function mockFlushAllPendingLikes() {
  for (const count of pendingLikesByPlayId.values()) {
    if (count !== 0) {
      // Simulate API call to update likes in DB
      flushedCount += count;
    }
  }
  pendingLikesByPlayId.clear();
}

function handleLikeReceivedCallback(trackTitle: string): void {
  const currentTrack = useLiveStore.getState().nowPlaying;
  if (!currentTrack || currentTrack.title !== trackTitle) return;

  useLiveStore.getState().incrementLiveLikes();
  const currentPlayId = useLiveStore.getState().currentPlayId;

  if (currentPlayId) {
    const currentCount = pendingLikesByPlayId.get(currentPlayId) || 0;
    pendingLikesByPlayId.set(currentPlayId, currentCount + 1);

    if (likeStorageTimer) clearTimeout(likeStorageTimer);
    likeStorageTimer = setTimeout(() => {
      void mockFlushAllPendingLikes();
    }, LIKE_STORAGE_DEBOUNCE_MS);
  }
}

function handleLikeRemovedCallback(trackTitle: string): void {
  const currentTrack = useLiveStore.getState().nowPlaying;
  if (!currentTrack || currentTrack.title !== trackTitle) return;

  useLiveStore.getState().decrementLiveLikes();
  const currentPlayId = useLiveStore.getState().currentPlayId;

  if (currentPlayId) {
    const currentCount = pendingLikesByPlayId.get(currentPlayId) || 0;
    pendingLikesByPlayId.set(currentPlayId, currentCount - 1);

    if (likeStorageTimer) clearTimeout(likeStorageTimer);
    likeStorageTimer = setTimeout(() => {
      void mockFlushAllPendingLikes();
    }, LIKE_STORAGE_DEBOUNCE_MS);
  }
}

describe("Heart Logic Integration", () => {
  beforeEach(() => {
    useLiveStore.getState().reset();
    pendingLikesByPlayId.clear();
    flushedCount = 0;
    if (likeStorageTimer) clearTimeout(likeStorageTimer);
    likeStorageTimer = null;
    vi.useFakeTimers();

    // Setup active track
    useLiveStore.getState().setNowPlaying({ artist: "Daft Punk", title: "One More Time" } as any);
    useLiveStore.getState().setCurrentPlayId(101);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should increment store and queue DB sync on LIKE_RECEIVED", () => {
    handleLikeReceivedCallback("One More Time");

    expect(useLiveStore.getState().liveLikes).toBe(1);
    expect(pendingLikesByPlayId.get(101)).toBe(1);

    // Fast forward to flush
    vi.advanceTimersByTime(LIKE_STORAGE_DEBOUNCE_MS);
    expect(flushedCount).toBe(1);
    expect(pendingLikesByPlayId.size).toBe(0);
  });

  it("should decrement store and queue DB sync on LIKE_REMOVED", () => {
    // Initial state: 5 likes
    useLiveStore.getState().setLiveLikes(5);

    handleLikeRemovedCallback("One More Time");

    expect(useLiveStore.getState().liveLikes).toBe(4);
    expect(pendingLikesByPlayId.get(101)).toBe(-1);

    vi.advanceTimersByTime(LIKE_STORAGE_DEBOUNCE_MS);
    expect(flushedCount).toBe(-1);
  });

  it("should stay in sync with multiple rapid like/unlike actions", () => {
    handleLikeReceivedCallback("One More Time");
    handleLikeReceivedCallback("One More Time");
    handleLikeRemovedCallback("One More Time"); // Net +1

    expect(useLiveStore.getState().liveLikes).toBe(1);
    expect(pendingLikesByPlayId.get(101)).toBe(1);

    vi.advanceTimersByTime(LIKE_STORAGE_DEBOUNCE_MS);
    expect(flushedCount).toBe(1);
  });

  it("should ignore messages for mismatching tracks (preventing corruption)", () => {
    handleLikeReceivedCallback("Wrong Track");

    expect(useLiveStore.getState().liveLikes).toBe(0);
    expect(pendingLikesByPlayId.size).toBe(0);
  });

  it("should handle track changes correctly during debounce window", () => {
    handleLikeReceivedCallback("One More Time");

    // Track change
    useLiveStore.getState().setNowPlaying({ artist: "Justice", title: "D.A.N.C.E." } as any);
    useLiveStore.getState().setCurrentPlayId(102);

    // Unlike for OLD track arriving late
    handleLikeRemovedCallback("One More Time");

    // Store should only reflect the like for "One More Time" but ignore the unlike since it's "old"
    // (Actually the current implementation ignores messages that don't match nowPlaying.title)
    expect(useLiveStore.getState().liveLikes).toBe(1);
    expect(pendingLikesByPlayId.get(101)).toBe(1);
    expect(pendingLikesByPlayId.get(102)).toBeUndefined();

    vi.advanceTimersByTime(LIKE_STORAGE_DEBOUNCE_MS);
    expect(flushedCount).toBe(1);
  });
});
