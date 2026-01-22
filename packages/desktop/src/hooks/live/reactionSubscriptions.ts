/**
 * Reaction subscription system
 *
 * Allows components to subscribe to reaction events (e.g., thank_you)
 * from dancers. Uses a simple pub/sub pattern.
 *
 * @package @pika/desktop
 */

import type { Reaction, ReactionCallback } from "./types";

// ============================================================================
// Module State
// ============================================================================

const reactionListeners = new Set<ReactionCallback>();

// ============================================================================
// Public API
// ============================================================================

/**
 * Subscribe to reaction events
 * @param callback - Function called when a reaction is received
 * @returns Unsubscribe function
 */
export function subscribeToReactions(callback: ReactionCallback): () => void {
  reactionListeners.add(callback);
  return () => {
    reactionListeners.delete(callback);
  };
}

/**
 * Notify all listeners of a reaction
 * Called by the WebSocket message handler
 */
export function notifyReactionListeners(reaction: Reaction): void {
  reactionListeners.forEach((callback) => {
    try {
      callback(reaction);
    } catch (e) {
      console.error("[Reactions] Listener error:", e);
    }
  });
}

/**
 * Get current listener count (for testing/debugging)
 */
export function getReactionListenerCount(): number {
  return reactionListeners.size;
}

/**
 * Clear all listeners (for testing/cleanup)
 */
export function clearReactionListeners(): void {
  reactionListeners.clear();
}
