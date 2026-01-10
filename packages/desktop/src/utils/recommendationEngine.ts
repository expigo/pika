/**
 * Recommendation Engine
 * Suggests tracks based on vibe similarity and transition safety.
 */

import type { Track } from "../db/repositories/trackRepository";
import { analyzeTransition } from "./transitionEngine";

// Default value for null metrics (neutral point)
const NEUTRAL_VALUE = 50;

/**
 * Calculate the Euclidean distance between two tracks' fingerprints.
 * Lower distance = more similar vibe.
 */
function calculateVibeDistance(trackA: Track, trackB: Track): number {
  const getMetric = (track: Track, key: keyof Track): number => {
    const value = track[key];
    if (typeof value === "number" && value !== null) {
      return value;
    }
    return NEUTRAL_VALUE;
  };

  const metrics: (keyof Track)[] = [
    "energy",
    "danceability",
    "brightness",
    "acousticness",
    "groove",
  ];

  let sumSquared = 0;
  for (const metric of metrics) {
    const diff = getMetric(trackA, metric) - getMetric(trackB, metric);
    sumSquared += diff * diff;
  }

  return Math.sqrt(sumSquared);
}

/**
 * Calculate a match percentage (0-100) from vibe distance.
 * Max distance is sqrt(5 * 100^2) = ~223.6
 */
function distanceToMatchPercent(distance: number): number {
  const maxDistance = Math.sqrt(5 * 100 * 100); // ~223.6
  const percent = 100 * (1 - distance / maxDistance);
  return Math.round(Math.max(0, Math.min(100, percent)));
}

export interface RecommendedTrack extends Track {
  matchPercent: number;
  vibeDistance: number;
}

/**
 * Get track recommendations based on vibe similarity and transition safety.
 *
 * @param sourceTrack - The track to find matches for
 * @param library - All available tracks in the library
 * @param limit - Maximum number of recommendations to return
 * @returns Array of recommended tracks sorted by best match
 */
export function getRecommendations(
  sourceTrack: Track,
  library: Track[],
  limit = 5,
): RecommendedTrack[] {
  // Filter out the source track itself
  const candidates = library.filter((t) => t.id !== sourceTrack.id);

  // Filter out "red" transitions (train wrecks)
  const safeTransitions = candidates.filter((candidate) => {
    const analysis = analyzeTransition(sourceTrack, candidate);
    return analysis.warningLevel !== "red";
  });

  // Calculate vibe distance for each safe candidate
  const scored: RecommendedTrack[] = safeTransitions.map((track) => {
    const vibeDistance = calculateVibeDistance(sourceTrack, track);
    const matchPercent = distanceToMatchPercent(vibeDistance);
    return {
      ...track,
      vibeDistance,
      matchPercent,
    };
  });

  // Sort by ascending distance (best matches first)
  scored.sort((a, b) => a.vibeDistance - b.vibeDistance);

  // Return top N
  return scored.slice(0, limit);
}

/**
 * Check if a track has enough data for meaningful recommendations.
 */
export function hasRecommendationData(track: Track): boolean {
  // At minimum, need energy or danceability
  return (
    track.energy !== null ||
    track.danceability !== null ||
    track.brightness !== null ||
    track.acousticness !== null ||
    track.groove !== null
  );
}
