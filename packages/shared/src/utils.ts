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

// ============================================================================
// Transition Intelligence (Camelot & Friction)
// ============================================================================

/**
 * Standard Musical Key to Camelot Notation mapping.
 * Used for harmonic mixing compatibility.
 */
export const KEY_TO_CAMELOT: Record<string, string> = {
  // Major
  C: "8B",
  "C#": "3B",
  Db: "3B",
  D: "10B",
  "D#": "5B",
  Eb: "5B",
  E: "12B",
  F: "7B",
  "F#": "2B",
  Gb: "2B",
  G: "9B",
  "G#": "4B",
  Ab: "4B",
  A: "11B",
  "A#": "6B",
  Bb: "6B",
  B: "1B",
  // Minor
  Am: "8A",
  "A#m": "3A",
  Bbm: "3A",
  Bm: "10A",
  Cm: "5A",
  "C#m": "12A",
  Dbm: "12A",
  Dm: "7A",
  "D#m": "2A",
  Ebm: "2A",
  Em: "9A",
  Fm: "4A",
  "F#m": "11A",
  Gbm: "11A",
  Gm: "6A",
  "G#m": "1A",
  Abm: "1A",
};

/**
 * Returns the Camelot notation for a given musical key.
 */
export function getCamelotKey(key: string | null | undefined): string | null {
  if (!key) return null;
  return KEY_TO_CAMELOT[key] || null;
}

export type HarmonicLevel = "perfect" | "harmonic" | "relative" | "boost" | "neutral";

export interface HarmonicRelation {
  level: HarmonicLevel;
  label: string;
  score: number;
  color: "green" | "emerald" | "blue" | "purple" | "slate";
}

/**
 * Calculates harmonic compatibility between two tracks.
 * Logic based on Camelot Wheel rules (adjacent, same, or relative).
 */
export function getHarmonicCompatibility(
  keyA: string | null,
  keyB: string | null,
): HarmonicRelation {
  const neutral: HarmonicRelation = {
    level: "neutral",
    label: "Neutral",
    score: 30,
    color: "slate",
  };

  if (!keyA || !keyB) return neutral;

  const camA = KEY_TO_CAMELOT[keyA];
  const camB = KEY_TO_CAMELOT[keyB];

  if (!camA || !camB) return neutral;
  if (camA === camB)
    return { level: "perfect", label: "Perfect Match", score: 100, color: "green" };

  const valA = parseInt(camA, 10);
  const valB = parseInt(camB, 10);
  const typeA = camA.slice(-1); // 'A' or 'B'
  const typeB = camB.slice(-1);

  // Same key type (A to A or B to B) - Adjacent
  if (typeA === typeB) {
    const diff = Math.abs(valA - valB);
    if (diff === 1 || diff === 11)
      return { level: "harmonic", label: "Harmonic", score: 80, color: "emerald" };
  }

  // Direct relative (e.g., 8A to 8B)
  if (valA === valB && typeA !== typeB)
    return { level: "relative", label: "Relative", score: 90, color: "blue" };

  // Energy boost (+2 Camelot steps)
  const isBoost =
    typeA === typeB &&
    (valB === (valA + 2) % 12 || (valA === 11 && valB === 1) || (valA === 12 && valB === 2));

  if (isBoost) return { level: "boost", label: "Energy Boost", score: 70, color: "purple" };

  return neutral;
}

/**
 * Calculates Euclidean distance between two track audio fingerprints.
 * Normalized to 0-100 (where 0 is identical, 100 is maximum "vibe friction").
 */
export function calculateVibeFriction(trackA: TrackInfo, trackB: TrackInfo): number {
  const fields: Array<keyof TrackInfo> = [
    "energy",
    "danceability",
    "brightness",
    "acousticness",
    "groove",
  ];
  let sumSq = 0;
  let count = 0;

  for (const field of fields) {
    const valA = trackA[field] as number | undefined;
    const valB = trackB[field] as number | undefined;
    if (typeof valA === "number" && typeof valB === "number") {
      sumSq += ((valA - valB) / 100) ** 2;
      count++;
    }
  }

  if (count === 0) return 0;

  // Average distance per dimension, then sqrt, then scaled
  const dist = Math.sqrt(sumSq / count);
  // Scaled so ~0.5 average difference across dimensions is "max friction" (100)
  return Math.min(Math.round(dist * 200), 100);
}
