/**
 * Common Utilities
 */

import type { TrackInfo } from "./schemas";

/**
 * Generate a unique key for a track based on artist and title.
 * Used for deduplication, like tracking, and caching.
 * Format: "Artist:Title"
 */
export function getTrackKey(track: { artist: string; title: string } | TrackInfo): string {
  return `${track.artist}:${track.title}`;
}
