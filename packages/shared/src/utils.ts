/**
 * Two-Tier Track Key System
 *
 * Exact Key: For database uniqueness, preserves (Remix), feat., etc.
 * Fuzzy Key: For search, suggestions, Spotify matching
 */

import type { TrackInfo } from "./schemas";

/**
 * Minimal normalization for exact matching.
 * Preserves: (Remix), feat. XYZ, [Radio Edit], etc.
 */
export function normalizeExact(text: string): string {
  return text.toLowerCase().trim().replace(/\s+/g, " "); // Collapse multiple spaces
}

/**
 * Aggressive normalization for fuzzy matching.
 * Strips: parentheses, brackets, feat., &, punctuation
 */
export function normalizeFuzzy(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/\s*\([^)]*\)/g, "") // Remove (anything in parens)
    .replace(/\s*\[[^\]]*\]/g, "") // Remove [anything in brackets]
    .replace(/\s*feat\.?\s+.*/i, "") // Remove feat. and everything after
    .replace(/\s*ft\.?\s+.*/i, "") // Remove ft. and everything after
    .replace(/\s*&\s+.*/g, "") // Remove & collaborators
    .replace(/[^\w\s]/g, "") // Remove punctuation
    .replace(/\s+/g, " ") // Collapse spaces
    .trim();
}

/**
 * Generate exact track key for database uniqueness.
 * Format: "artist::title" (normalized but preserves versions)
 *
 * @example
 * getTrackKey("Delta Dreambox", "Queen of Loneliness (Remix)")
 * // => "delta dreambox::queen of loneliness (remix)"
 */
export function getTrackKey(artist: string, title: string): string;
export function getTrackKey(track: { artist: string; title: string } | TrackInfo): string;
export function getTrackKey(
  artistOrTrack: string | { artist: string; title: string } | TrackInfo,
  title?: string,
): string {
  if (typeof artistOrTrack === "string") {
    return `${normalizeExact(artistOrTrack)}::${normalizeExact(title ?? "")}`;
  }
  return `${normalizeExact(artistOrTrack.artist)}::${normalizeExact(artistOrTrack.title)}`;
}

/**
 * Generate fuzzy track key for search/suggestions.
 * Strips remix info, features, etc.
 *
 * @example
 * getFuzzyKey("Delta Dreambox feat. Singer", "Queen of Loneliness (Remix)")
 * // => "delta dreambox::queen of loneliness"
 */
export function getFuzzyKey(artist: string, title: string): string;
export function getFuzzyKey(track: { artist: string; title: string } | TrackInfo): string;
export function getFuzzyKey(
  artistOrTrack: string | { artist: string; title: string } | TrackInfo,
  title?: string,
): string {
  if (typeof artistOrTrack === "string") {
    return `${normalizeFuzzy(artistOrTrack)}::${normalizeFuzzy(title ?? "")}`;
  }
  return `${normalizeFuzzy(artistOrTrack.artist)}::${normalizeFuzzy(artistOrTrack.title)}`;
}

/**
 * Normalize track metadata for cleaner DB storage and improved matching.
 * @deprecated Use getTrackKey() or getFuzzyKey() instead
 */
export function normalizeTrack(artist: string, title: string): { artist: string; title: string } {
  return {
    artist: normalizeExact(artist),
    title: normalizeExact(title),
  };
}
