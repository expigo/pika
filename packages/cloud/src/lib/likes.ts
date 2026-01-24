/**
 * Like Tracking
 *
 * @file likes.ts
 * @package @pika/cloud
 * @created 2026-01-21
 *
 * PURPOSE:
 * Tracks which clients have liked which tracks in a session
 * to prevent duplicate likes.
 *
 * FUTURE:
 * Can swap Map for Redis SET for distributed like tracking.
 */

import { getTrackKey, type TrackInfo } from "@pika/shared";

// ============================================================================
// State
// ============================================================================

// Key: sessionId -> Map<clientId, Set<trackKey>>
const likesSent = new Map<string, Map<string, Set<string>>>();

// ============================================================================
// Operations
// ============================================================================

/**
 * Check if client has already liked this track in this session
 */
export function hasLikedTrack(sessionId: string, clientId: string, track: TrackInfo): boolean {
  return likesSent.get(sessionId)?.get(clientId)?.has(getTrackKey(track)) ?? false;
}

/**
 * Record a like for a track
 */
export function recordLike(sessionId: string, clientId: string, track: TrackInfo): void {
  let sessionLikes = likesSent.get(sessionId);
  if (!sessionLikes) {
    sessionLikes = new Map();
    likesSent.set(sessionId, sessionLikes);
  }

  let clientLikes = sessionLikes.get(clientId);
  if (!clientLikes) {
    clientLikes = new Set();
    sessionLikes.set(clientId, clientLikes);
  }

  clientLikes.add(getTrackKey(track));
}

/**
 * Clear all likes for a session (when session ends)
 */
export function clearLikesForSession(sessionId: string): void {
  likesSent.delete(sessionId);
}

/**
 * Get count of likes tracked (for monitoring)
 */
export function getLikeEntryCount(): number {
  let count = 0;
  for (const session of likesSent.values()) {
    count += session.size;
  }
  return count;
}

/**
 * Clear all likes (for testing)
 */
export function clearAllLikes(): void {
  likesSent.clear();
}
