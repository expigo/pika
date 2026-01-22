/**
 * Like batching for toast notifications
 *
 * Batches incoming likes to prevent toast spam.
 * Shows aggregated toast like "5 people liked 'Song Name'"
 *
 * @package @pika/desktop
 */

import { toast } from "sonner";
import { DEFAULT_LIKE_BATCH_CONFIG, type LikeBatchConfig } from "./types";

// ============================================================================
// Module State
// ============================================================================

let pendingLikeCount = 0;
let pendingLikeTrackTitle: string | null = null;
let likeBatchTimer: ReturnType<typeof setTimeout> | null = null;
let config: LikeBatchConfig = DEFAULT_LIKE_BATCH_CONFIG;

// ============================================================================
// Public API
// ============================================================================

/**
 * Configure batching thresholds
 */
export function configureLikeBatching(newConfig: Partial<LikeBatchConfig>): void {
  config = { ...config, ...newConfig };
}

/**
 * Flush the current like batch and show toast if there are pending likes
 */
export function flushLikeBatch(): void {
  if (pendingLikeCount > 0 && pendingLikeTrackTitle) {
    const count = pendingLikeCount;
    const title = pendingLikeTrackTitle;
    const message = count === 1 ? `Someone liked "${title}"` : `${count} people liked "${title}"`;
    toast(message, { icon: "❤️", duration: 3000 });
    console.log(`[Likes] Batch flushed: ${count} likes for "${title}"`);
  }

  // Reset state
  pendingLikeCount = 0;
  pendingLikeTrackTitle = null;

  if (likeBatchTimer) {
    clearTimeout(likeBatchTimer);
    likeBatchTimer = null;
  }
}

/**
 * Add a like to the pending batch
 * Will auto-flush when threshold or timeout is reached
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
    likeBatchTimer = setTimeout(flushLikeBatch, config.timeoutMs);
  }

  // Flush immediately if we hit threshold
  if (pendingLikeCount >= config.threshold) {
    flushLikeBatch();
  }
}

/**
 * Get current pending count (for testing)
 */
export function getPendingLikeCount(): number {
  return pendingLikeCount;
}

/**
 * Get current pending track title (for testing)
 */
export function getPendingLikeTrackTitle(): string | null {
  return pendingLikeTrackTitle;
}

/**
 * Reset all batching state (for testing/cleanup)
 */
export function resetLikeBatching(): void {
  flushLikeBatch();
  pendingLikeCount = 0;
  pendingLikeTrackTitle = null;
  config = DEFAULT_LIKE_BATCH_CONFIG;
}
