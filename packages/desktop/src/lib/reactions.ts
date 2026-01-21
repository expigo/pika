/**
 * Reaction Subscriptions
 *
 * @file reactions.ts
 * @package @pika/desktop
 * @created 2026-01-21
 *
 * PURPOSE:
 * Pub/sub for reaction events (thank_you from dancers).
 */

// ============================================================================
// Types
// ============================================================================

export type ReactionCallback = (reaction: "thank_you") => void;

// ============================================================================
// State
// ============================================================================

const reactionListeners = new Set<ReactionCallback>();

// ============================================================================
// Operations
// ============================================================================

/**
 * Subscribe to reaction events
 * @returns Unsubscribe function
 */
export function subscribeToReactions(callback: ReactionCallback): () => void {
  reactionListeners.add(callback);
  return () => {
    reactionListeners.delete(callback);
  };
}

/**
 * Notify all subscribers of a reaction
 */
export function notifyReaction(reaction: "thank_you"): void {
  for (const callback of reactionListeners) {
    try {
      callback(reaction);
    } catch (e) {
      console.error("[Reactions] Callback error:", e);
    }
  }
}

/**
 * Get subscriber count (for testing)
 */
export function getSubscriberCount(): number {
  return reactionListeners.size;
}

/**
 * Clear all subscribers (for cleanup)
 */
export function clearSubscribers(): void {
  reactionListeners.clear();
}
