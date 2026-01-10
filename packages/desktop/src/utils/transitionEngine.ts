/**
 * Transition Engine
 * Analyzes transitions between tracks for harmonic compatibility and BPM matching.
 */

import type { Track } from "../db/repositories/trackRepository";

// ============================================================================
// Camelot Wheel Mapping
// ============================================================================

/**
 * Maps standard musical keys to Camelot notation.
 * Major keys use "B" suffix, Minor keys use "A" suffix.
 */
const KEY_TO_CAMELOT: Record<string, string> = {
  // Major keys (B)
  C: "8B",
  G: "9B",
  D: "10B",
  A: "11B",
  E: "12B",
  B: "1B",
  "F#": "2B",
  Gb: "2B",
  Db: "3B",
  "C#": "3B",
  Ab: "4B",
  "G#": "4B",
  Eb: "5B",
  "D#": "5B",
  Bb: "6B",
  "A#": "6B",
  F: "7B",

  // Minor keys (A)
  Am: "8A",
  Em: "9A",
  Bm: "10A",
  "F#m": "11A",
  Gbm: "11A",
  "C#m": "12A",
  Dbm: "12A",
  "G#m": "1A",
  Abm: "1A",
  "D#m": "2A",
  Ebm: "2A",
  "A#m": "3A",
  Bbm: "3A",
  Fm: "4A",
  Cm: "5A",
  Gm: "6A",
  Dm: "7A",
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Convert a musical key to Camelot notation.
 */
export function toCamelot(key: string | null | undefined): string | null {
  if (!key) return null;

  // Normalize the key (trim whitespace)
  const normalized = key.trim();

  // Direct lookup
  if (KEY_TO_CAMELOT[normalized]) {
    return KEY_TO_CAMELOT[normalized];
  }

  // Try with different case variations
  const variations = [
    normalized,
    normalized.toUpperCase(),
    normalized.charAt(0).toUpperCase() + normalized.slice(1).toLowerCase(),
  ];

  for (const variant of variations) {
    if (KEY_TO_CAMELOT[variant]) {
      return KEY_TO_CAMELOT[variant];
    }
  }

  return null;
}

/**
 * Parse a Camelot code into its number and letter components.
 */
function parseCamelot(camelot: string): { number: number; letter: string } | null {
  const match = camelot.match(/^(\d+)([AB])$/);
  if (!match) return null;
  return { number: parseInt(match[1], 10), letter: match[2] };
}

/**
 * Check if two keys are harmonically compatible.
 * Compatible if:
 * - Same key
 * - Adjacent on Camelot wheel (±1 hour, wrapping 12->1 and 1->12)
 * - Relative major/minor (same number, different letter)
 */
export function isHarmonic(
  keyA: string | null | undefined,
  keyB: string | null | undefined,
): boolean {
  const camelotA = toCamelot(keyA);
  const camelotB = toCamelot(keyB);

  // If either key is unknown, assume compatible (no warning)
  if (!camelotA || !camelotB) return true;

  // Same key
  if (camelotA === camelotB) return true;

  const parsedA = parseCamelot(camelotA);
  const parsedB = parseCamelot(camelotB);

  if (!parsedA || !parsedB) return true;

  // Same number = relative major/minor (always compatible)
  if (parsedA.number === parsedB.number) return true;

  // Adjacent on wheel (same letter, ±1 with wrapping)
  if (parsedA.letter === parsedB.letter) {
    const diff = Math.abs(parsedA.number - parsedB.number);
    // Adjacent: diff is 1 or 11 (for 12->1 wrap)
    if (diff === 1 || diff === 11) return true;
  }

  return false;
}

/**
 * Calculate BPM difference as a percentage.
 */
export function getBpmDiff(
  bpmA: number | null | undefined,
  bpmB: number | null | undefined,
): number | null {
  if (!bpmA || !bpmB || bpmA === 0) return null;
  return Math.abs((bpmA - bpmB) / bpmA) * 100;
}

// ============================================================================
// Transition Analysis
// ============================================================================

export type WarningLevel = "none" | "yellow" | "red";

export interface TransitionAnalysis {
  bpmDiff: number | null;
  isHarmonic: boolean;
  warningLevel: WarningLevel;
  // For tooltip display
  camelotA: string | null;
  camelotB: string | null;
  issues: string[];
}

/**
 * Analyze the transition between two tracks.
 * Returns warning level and specific issues.
 */
export function analyzeTransition(trackA: Track, trackB: Track): TransitionAnalysis {
  const camelotA = toCamelot(trackA.key);
  const camelotB = toCamelot(trackB.key);
  const harmonic = isHarmonic(trackA.key, trackB.key);
  const bpmDiff = getBpmDiff(trackA.bpm, trackB.bpm);

  const issues: string[] = [];
  let warningLevel: WarningLevel = "none";

  // Check for key clash (only if both keys are known)
  if (camelotA && camelotB && !harmonic) {
    issues.push(`Key Clash: ${camelotA} → ${camelotB}`);
    warningLevel = "red";
  }

  // Check BPM difference
  if (bpmDiff !== null) {
    if (bpmDiff > 10) {
      const sign = (trackB.bpm ?? 0) > (trackA.bpm ?? 0) ? "+" : "-";
      issues.push(`BPM Gap: ${sign}${bpmDiff.toFixed(0)}%`);
      warningLevel = "red";
    } else if (bpmDiff > 5) {
      const sign = (trackB.bpm ?? 0) > (trackA.bpm ?? 0) ? "+" : "-";
      issues.push(`BPM Gap: ${sign}${bpmDiff.toFixed(0)}%`);
      if (warningLevel === "none") {
        warningLevel = "yellow";
      }
    }
  }

  return {
    bpmDiff,
    isHarmonic: harmonic,
    warningLevel,
    camelotA,
    camelotB,
    issues,
  };
}
