/**
 * Like Batching
 *
 * @file likeBatching.ts
 * @package @pika/desktop
 * @created 2026-01-21
 *
 * PURPOSE:
 * Batch incoming likes to show consolidated toast notifications.
 */

import { toast } from "sonner";

// ============================================================================
// Constants
// ============================================================================

export const LIKE_BATCH_THRESHOLD = 5; // Show toast after this many likes
export const LIKE_BATCH_TIMEOUT_MS = 3000; // Or after this many ms

// ============================================================================
// State
// ============================================================================

let pendingLikeCount = 0;
let pendingLikeTrackTitle: string | null = null;
let likeBatchTimer: ReturnType<typeof setTimeout> | null = null;

// ============================================================================
// Operations
// ============================================================================

/**
 * Flush pending likes and show toast
 */
export function flushLikeBatch(): void {
  if (pendingLikeCount > 0 && pendingLikeTrackTitle) {
    const count = pendingLikeCount;
    const title = pendingLikeTrackTitle;
    const message = count === 1 ? `Someone liked "${title}"` : `${count} people liked "${title}"`;
    toast(message, { icon: "❤️", duration: 3000 });
    console.log(`[Live] Like batch flushed: ${count} likes for "${title}"`);
  }
  pendingLikeCount = 0;
  pendingLikeTrackTitle = null;
  if (likeBatchTimer) {
    clearTimeout(likeBatchTimer);
    likeBatchTimer = null;
  }
}

/**
 * Add a like to the pending batch
 */
export function addToPendingLikes(trackTitle: string): void {
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

/**
 * Get current pending like count (for testing)
 */
export function getPendingLikeCount(): number {
  return pendingLikeCount;
}

/**
 * Reset like batch state (for testing/cleanup)
 */
export function resetLikeBatch(): void {
  pendingLikeCount = 0;
  pendingLikeTrackTitle = null;
  if (likeBatchTimer) {
    clearTimeout(likeBatchTimer);
    likeBatchTimer = null;
  }
}
