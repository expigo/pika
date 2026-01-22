/**
 * Track Broadcasting with Deduplication
 *
 * Handles broadcasting tracks to the cloud with:
 * - Deduplication (prevent same track being sent twice)
 * - Live likes reset on track change
 * - Reliable mode for critical track updates
 *
 * @package @pika/desktop
 */

import { MESSAGE_TYPES, type TrackInfo } from "@pika/shared";
import { useLiveStore } from "../useLiveStore";
import { sendMessage } from "./messageSender";
import {
  getLastBroadcastedTrackKey as getLastKeyFromStore,
  setLastBroadcastedTrackKey as setLastKeyInStore,
} from "./stateHelpers";
import type { TrackBroadcastResult } from "./types";

// ============================================================================
// Public API
// ============================================================================

/**
 * Generate a unique session ID for each live session.
 * Each "Go Live" creates a new session with its own recap.
 */
export function generateSessionId(): string {
  return `pika_${Date.now()}_${Math.random().toString(36).substring(7)}`;
}

/**
 * Get the track key for deduplication
 */
export function getTrackKey(track: TrackInfo): string {
  return `${track.artist}:${track.title}`;
}

/**
 * Broadcast track to cloud with deduplication
 * Prevents the same track being sent multiple times
 *
 * @param sessionId - Current session ID
 * @param track - Track info to broadcast
 * @returns Whether the track was broadcasted (false if duplicate)
 */
export function broadcastTrack(sessionId: string, track: TrackInfo): TrackBroadcastResult {
  const trackKey = getTrackKey(track);

  // Check for duplicate using store
  if (getLastKeyFromStore() === trackKey) {
    console.log("[Broadcast] Skipping duplicate:", track.title);
    return { broadcasted: false, trackKey };
  }

  // Update store with new track key
  setLastKeyInStore(trackKey);

  // Reset live likes counter when track changes
  useLiveStore.getState().setLiveLikes(0);

  // Track this song as "played" for repeat prevention in LibraryBrowser
  useLiveStore.getState().addPlayedTrack(trackKey);

  // Use reliable mode for critical track broadcasts
  sendMessage(
    {
      type: MESSAGE_TYPES.BROADCAST_TRACK,
      sessionId,
      track,
    },
    true, // reliable: wait for ACK, retry on failure
  );

  console.log("[Broadcast] Sent track:", track.title);
  return { broadcasted: true, trackKey };
}

/**
 * Reset the last broadcasted track key
 * Called when clearing now playing or on session end
 */
export function resetLastBroadcastedTrack(): void {
  setLastKeyInStore(null);
}

/**
 * Get the last broadcasted track key (for testing/debugging)
 * NOTE: Now delegates to store helper
 */
export function getLastBroadcastedTrackKey(): string | null {
  return getLastKeyFromStore();
}

/**
 * Force re-broadcast by clearing the last key
 * Used by forceSync to bypass deduplication
 */
export function forceReBroadcast(sessionId: string, track: TrackInfo): TrackBroadcastResult {
  setLastKeyInStore(null);
  return broadcastTrack(sessionId, track);
}
