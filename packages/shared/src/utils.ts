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

/**
 * Normalize track metadata for cleaner DB storage and improved matching.
 * - Removes "ft.", "feat.", "featuring" from Title
 * - Removes " (Official Video)", " [Official Audio]", etc.
 * - Trims whitespace
 */
export function normalizeTrack(artist: string, title: string): { artist: string; title: string } {
  const cleanArtist = artist.trim();
  let cleanTitle = title.trim();

  // 1. Remove "featuring" from Title (common in scraped data)
  // Regex: matches (ft. Artist) or [feat. Artist] or feat. Artist
  // We don't try to extract the featured artist to the artist field yet, just strip it for matching.
  const featRegex = /[([{-]?\s*(?:ft\.|feat\.|featuring)\s+[^)\]}]+[)\]}]?/gi;
  cleanTitle = cleanTitle.replace(featRegex, "").trim();

  // 2. Remove purely "marketing" suffixes
  // " (Official Video)", " [Official Audio]", " (Lyrics)", " (Visualizer)"
  const marketingRegex =
    /\s*[([{-]?(?:official\s+(?:video|audio|music\s+video|lyric\s+video)|lyrics|visualizer|remastered\s+\d+|remastered)[)\]}]?/gi;
  cleanTitle = cleanTitle.replace(marketingRegex, "").trim();

  // 3. Remove "Original Mix" / "Extended Mix" if desired?
  // User roadmap said: "Remove generic brackets like [Original Mix]"
  const mixRegex = /\s*[([{-](?:original\s+mix|extended\s+mix)[)\]}]?/gi;
  cleanTitle = cleanTitle.replace(mixRegex, "").trim();

  // 4. Remove empty brackets that might be left over "()"
  cleanTitle = cleanTitle.replace(/\s*\(\s*\)/g, "").trim();
  cleanTitle = cleanTitle.replace(/\s*\[\s*\]/g, "").trim();

  return {
    artist: cleanArtist,
    title: cleanTitle,
  };
}
