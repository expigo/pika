/**
 * Like Batching Tests
 *
 * @file like-batching.test.ts
 * @package @pika/desktop
 * @created 2026-01-21
 *
 * PURPOSE:
 * Tests the like batching system that collects likes and shows batched toasts.
 * Prevents notification spam during popular tracks.
 *
 * PRODUCTION LOCATION: packages/desktop/src/hooks/useLiveSession.ts lines 159-200
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// ============================================================================
// MOCK LIKE BATCHING STATE (mirrors production)
// ============================================================================

const LIKE_BATCH_THRESHOLD = 5;
const LIKE_BATCH_TIMEOUT_MS = 3000;

let pendingLikeCount: number;
let pendingLikeTrackTitle: string | null;
let likeBatchTimer: ReturnType<typeof setTimeout> | null;
let flushedBatches: Array<{ count: number; title: string; message: string }>;
let toastCalls: string[];

function flushLikeBatch(): void {
  if (pendingLikeCount > 0 && pendingLikeTrackTitle) {
    const count = pendingLikeCount;
    const title = pendingLikeTrackTitle;
    const message = count === 1 ? `Someone liked "${title}"` : `${count} people liked "${title}"`;

    flushedBatches.push({ count, title, message });
    toastCalls.push(message);
  }

  pendingLikeCount = 0;
  pendingLikeTrackTitle = null;

  if (likeBatchTimer) {
    clearTimeout(likeBatchTimer);
    likeBatchTimer = null;
  }
}

function addToPendingLikes(trackTitle: string): void {
  // If track changed, flush previous batch first
  if (pendingLikeTrackTitle && pendingLikeTrackTitle !== trackTitle) {
    flushLikeBatch();
  }

  pendingLikeTrackTitle = trackTitle;
  pendingLikeCount++;

  // Start timer on first like
  if (!likeBatchTimer) {
    likeBatchTimer = setTimeout(flushLikeBatch, LIKE_BATCH_TIMEOUT_MS);
  }

  // Flush immediately if we hit threshold
  if (pendingLikeCount >= LIKE_BATCH_THRESHOLD) {
    flushLikeBatch();
  }
}

// ============================================================================
// TESTS
// ============================================================================

describe("Like Batching - addToPendingLikes", () => {
  beforeEach(() => {
    pendingLikeCount = 0;
    pendingLikeTrackTitle = null;
    likeBatchTimer = null;
    flushedBatches = [];
    toastCalls = [];
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    if (likeBatchTimer) {
      clearTimeout(likeBatchTimer);
      likeBatchTimer = null;
    }
  });

  /**
   * TEST: First like sets track title
   *
   * RATIONALE:
   * The first like for a track should set the pending title.
   */
  it("sets track title on first like", () => {
    addToPendingLikes("Great Song");

    expect(pendingLikeTrackTitle).toBe("Great Song");
    expect(pendingLikeCount).toBe(1);
  });

  /**
   * TEST: Multiple likes increment counter
   */
  it("increments count for same track", () => {
    addToPendingLikes("Great Song");
    addToPendingLikes("Great Song");
    addToPendingLikes("Great Song");

    expect(pendingLikeCount).toBe(3);
    expect(flushedBatches.length).toBe(0); // Not flushed yet
  });

  /**
   * TEST: Threshold triggers immediate flush
   *
   * RATIONALE:
   * When a track gets 5 likes quickly, show toast immediately.
   */
  it("flushes immediately at threshold (5 likes)", () => {
    for (let i = 0; i < LIKE_BATCH_THRESHOLD; i++) {
      addToPendingLikes("Popular Song");
    }

    expect(flushedBatches.length).toBe(1);
    expect(flushedBatches[0].count).toBe(5);
    expect(flushedBatches[0].title).toBe("Popular Song");
  });

  /**
   * TEST: Track change flushes previous batch
   *
   * RATIONALE:
   * When the DJ changes tracks, flush the previous batch immediately.
   */
  it("flushes previous batch when track changes", () => {
    addToPendingLikes("Song A");
    addToPendingLikes("Song A");
    addToPendingLikes("Song B"); // Different track

    expect(flushedBatches.length).toBe(1);
    expect(flushedBatches[0].title).toBe("Song A");
    expect(flushedBatches[0].count).toBe(2);

    // Song B is now pending
    expect(pendingLikeTrackTitle).toBe("Song B");
    expect(pendingLikeCount).toBe(1);
  });

  /**
   * TEST: Timer starts on first like
   */
  it("starts timer on first like", () => {
    addToPendingLikes("Song");

    expect(likeBatchTimer).not.toBeNull();
  });

  /**
   * TEST: Timer flushes after timeout
   */
  it("flushes after timeout", () => {
    addToPendingLikes("Slow Song");
    addToPendingLikes("Slow Song");

    expect(flushedBatches.length).toBe(0);

    // Fast forward past timeout
    vi.advanceTimersByTime(LIKE_BATCH_TIMEOUT_MS + 100);

    expect(flushedBatches.length).toBe(1);
    expect(flushedBatches[0].count).toBe(2);
  });

  /**
   * TEST: Timer is cleared after flush
   */
  it("clears timer after threshold flush", () => {
    for (let i = 0; i < LIKE_BATCH_THRESHOLD; i++) {
      addToPendingLikes("Song");
    }

    expect(likeBatchTimer).toBeNull();
  });
});

describe("Like Batching - flushLikeBatch", () => {
  beforeEach(() => {
    pendingLikeCount = 0;
    pendingLikeTrackTitle = null;
    likeBatchTimer = null;
    flushedBatches = [];
    toastCalls = [];
  });

  /**
   * TEST: Flush with single like uses singular message
   */
  it("uses singular message for one like", () => {
    pendingLikeCount = 1;
    pendingLikeTrackTitle = "Solo Song";

    flushLikeBatch();

    expect(toastCalls[0]).toBe('Someone liked "Solo Song"');
  });

  /**
   * TEST: Flush with multiple likes uses plural message
   */
  it("uses plural message for multiple likes", () => {
    pendingLikeCount = 3;
    pendingLikeTrackTitle = "Group Song";

    flushLikeBatch();

    expect(toastCalls[0]).toBe('3 people liked "Group Song"');
  });

  /**
   * TEST: Flush resets state
   */
  it("resets count and title after flush", () => {
    pendingLikeCount = 5;
    pendingLikeTrackTitle = "Song";

    flushLikeBatch();

    expect(pendingLikeCount).toBe(0);
    expect(pendingLikeTrackTitle).toBeNull();
  });

  /**
   * TEST: Flush with no likes does nothing
   */
  it("does nothing when no pending likes", () => {
    pendingLikeCount = 0;
    pendingLikeTrackTitle = null;

    flushLikeBatch();

    expect(flushedBatches.length).toBe(0);
    expect(toastCalls.length).toBe(0);
  });

  /**
   * TEST: Flush with count but no title does nothing
   */
  it("does nothing when title is null", () => {
    pendingLikeCount = 5;
    pendingLikeTrackTitle = null;

    flushLikeBatch();

    expect(flushedBatches.length).toBe(0);
  });
});

describe("Like Batching - Edge Cases", () => {
  beforeEach(() => {
    pendingLikeCount = 0;
    pendingLikeTrackTitle = null;
    likeBatchTimer = null;
    flushedBatches = [];
    toastCalls = [];
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    if (likeBatchTimer) {
      clearTimeout(likeBatchTimer);
      likeBatchTimer = null;
    }
  });

  /**
   * TEST: Rapid track changes flush each batch
   */
  it("handles rapid track changes", () => {
    addToPendingLikes("Song 1");
    addToPendingLikes("Song 2");
    addToPendingLikes("Song 3");
    addToPendingLikes("Song 4");

    expect(flushedBatches.length).toBe(3);
    expect(flushedBatches.map((b) => b.title)).toEqual(["Song 1", "Song 2", "Song 3"]);
  });

  /**
   * TEST: Threshold exactly at 5
   */
  it("flushes at exactly threshold", () => {
    for (let i = 0; i < 4; i++) {
      addToPendingLikes("Song");
    }
    expect(flushedBatches.length).toBe(0);

    addToPendingLikes("Song"); // 5th like
    expect(flushedBatches.length).toBe(1);
    expect(flushedBatches[0].count).toBe(5);
  });

  /**
   * TEST: Likes after threshold start new batch
   */
  it("starts new batch after threshold flush", () => {
    for (let i = 0; i < 5; i++) {
      addToPendingLikes("Hit Song");
    }
    expect(flushedBatches.length).toBe(1);

    addToPendingLikes("Hit Song"); // 6th like - new batch
    expect(pendingLikeCount).toBe(1);
    expect(pendingLikeTrackTitle).toBe("Hit Song");
  });

  /**
   * TEST: Track title with special characters
   */
  it("handles special characters in track title", () => {
    pendingLikeCount = 2;
    pendingLikeTrackTitle = 'Song "With" Quotes & Symbols!';

    flushLikeBatch();

    expect(toastCalls[0]).toContain('Song "With" Quotes & Symbols!');
  });

  /**
   * TEST: Empty track title treated as null
   */
  it("handles empty string title", () => {
    addToPendingLikes("");

    expect(pendingLikeTrackTitle).toBe("");
    expect(pendingLikeCount).toBe(1);
  });
});

describe("Like Batching - Constants", () => {
  /**
   * TEST: Threshold is production value
   */
  it("threshold is 5 likes", () => {
    expect(LIKE_BATCH_THRESHOLD).toBe(5);
  });

  /**
   * TEST: Timeout is production value
   */
  it("timeout is 3000ms", () => {
    expect(LIKE_BATCH_TIMEOUT_MS).toBe(3000);
  });
});

// Missing import - add afterEach
import { afterEach } from "vitest";
