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

// Key: "sessionId:clientId" -> Set of track keys
const likesSent = new Map<string, Set<string>>();

// ============================================================================
// Operations
// ============================================================================

/**
 * Check if client has already liked this track in this session
 */
export function hasLikedTrack(sessionId: string, clientId: string, track: TrackInfo): boolean {
  const key = `${sessionId}:${clientId}`;
  const clientLikes = likesSent.get(key);
  if (!clientLikes) return false;
  return clientLikes.has(getTrackKey(track));
}

/**
 * Record a like for a track
 */
export function recordLike(sessionId: string, clientId: string, track: TrackInfo): void {
  const key = `${sessionId}:${clientId}`;
  if (!likesSent.has(key)) {
    likesSent.set(key, new Set());
  }
  likesSent.get(key)?.add(getTrackKey(track));
}

/**
 * Clear all likes for a session (when session ends)
 */
export function clearLikesForSession(sessionId: string): void {
  for (const key of likesSent.keys()) {
    if (key.startsWith(`${sessionId}:`)) {
      likesSent.delete(key);
    }
  }
}

/**
 * Get count of likes tracked (for monitoring)
 */
export function getLikeEntryCount(): number {
  return likesSent.size;
}

/**
 * Clear all likes (for testing)
 */
export function clearAllLikes(): void {
  likesSent.clear();
}
