/**
 * Pure scoring layer for Spotify track matching — extracted from spotifyMatch.ts so the ranking
 * math is unit-testable with zero HTTP/DB surface (no `../../db`, no fetch, no app token; the
 * sole dependency is `getFuzzyKey` from @pika/shared). `searchAndRank` in spotifyMatch.ts is the
 * only production consumer.
 */

import { getFuzzyKey } from "@pika/shared";

export interface MatchCandidate {
  spotifyId: string;
  uri: string; // spotify:track:ID
  url: string; // open.spotify.com/track/ID
  name: string;
  artists: string;
  durationMs: number;
  popularity: number;
  albumArtUrl?: string | undefined;
}

export type MatchConfidence = "high" | "medium" | "low" | "none";

// ---------------------------------------------------------------------------
// Ranking (pure, unit-tested)
// ---------------------------------------------------------------------------

function tokenize(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .split(/[^a-z0-9]+/i)
      .filter(Boolean),
  );
}

/** Sørensen–Dice coefficient over token sets (0..1). */
function diceSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return (2 * inter) / (a.size + b.size);
}

/** ±3 s → 1.0 (strong), then decays to 0 over the next 30 s. Neutral 0.5 when duration unknown. */
function durationScore(queryMs: number | undefined, candMs: number): number {
  if (!queryMs || !candMs) return 0.5;
  const diff = Math.abs(queryMs - candMs);
  if (diff <= 3000) return 1;
  return Math.max(0, 1 - (diff - 3000) / 30000);
}

// Version descriptors that distinguish recordings of the "same" song — the signal we must keep
// for WCS (acoustic/slow/remix/cover edits are the norm, not the studio original).
const DESCRIPTORS = [
  "acoustic",
  "unplugged",
  "instrumental",
  "live",
  "remix",
  "edit",
  "cover",
  "remaster",
  "remastered",
  "extended",
  "version",
  "demo",
  "reprise",
];

function descriptorSet(s: string): Set<string> {
  const l = s.toLowerCase();
  return new Set(DESCRIPTORS.filter((d) => l.includes(d)));
}

/**
 * Reward a candidate whose version descriptors match the played title's, and penalise mismatches —
 * so a played "Believer (Acoustic)" prefers the acoustic recording, and a plain "Believer" prefers
 * the studio original over a remix/live. (The fuzzy-key floor below treats all versions as the same
 * song, so this delta is what separates them.)
 */
function descriptorDelta(queryTitle: string, candidateName: string): number {
  const want = descriptorSet(queryTitle);
  const have = descriptorSet(candidateName);
  let d = 0;
  for (const x of want) d += have.has(x) ? 0.12 : -0.12; // a wanted descriptor present / missing
  for (const x of have) if (!want.has(x)) d -= 0.06; // candidate carries an un-asked-for version
  return d;
}

export function scoreCandidate(
  query: { artist: string; title: string; durationMs?: number | undefined },
  c: MatchCandidate,
): number {
  const qTokens = tokenize(`${query.artist} ${query.title}`);
  const nameSim = diceSimilarity(qTokens, tokenize(`${c.artists} ${c.name}`));
  const dur = durationScore(query.durationMs, c.durationMs);
  const pop = Math.max(0, Math.min(100, c.popularity)) / 100;
  let score = 0.55 * nameSim + 0.3 * dur + 0.15 * pop;
  // A fuzzy-key exact match (same normalized artist::title) is a strong identity signal.
  if (getFuzzyKey(c.artists, c.name) === getFuzzyKey(query.artist, query.title)) {
    score = Math.max(score, 0.85);
  }
  // …then nudge by version alignment so the right *recording* wins, not just the right song.
  score += descriptorDelta(query.title, c.name);
  return Math.max(0, Math.min(1, score));
}

export function confidenceTier(score: number): MatchConfidence {
  if (score >= 0.8) return "high";
  if (score >= 0.55) return "medium";
  if (score > 0) return "low";
  return "none";
}
