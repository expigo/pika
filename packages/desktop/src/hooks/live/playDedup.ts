/**
 * 🛡️ Hybrid Dedup — Layer 2 (absolute interval).
 *
 * Tracks the last play timestamp per track (lowercased `artist-title`) for the CURRENT session, so
 * the same track can't be recorded twice within {@link MIN_REPLAY_INTERVAL_MS} even if the 60s
 * `TRACK_DEDUP_WINDOW_MS` key window rolls over (e.g. visibility toggles across a boundary).
 *
 * Sole owner of this module-level state (extracted from `useLiveSession.ts`, 2026-07): `recordPlay`
 * reads + writes it, session end clears it, and history import seeds it via `registerImportedTrack`.
 */

const sessionTrackTimestamps = new Map<string, number>();

export const MIN_REPLAY_INTERVAL_MS = 120000; // 2 minutes minimum between same track

/** Last time (ms epoch) this absolute key was recorded, or `undefined` if never. */
export function getTrackLastPlay(absoluteKey: string): number | undefined {
  return sessionTrackTimestamps.get(absoluteKey);
}

/** Record the last-play time for an absolute key. */
export function setTrackLastPlay(absoluteKey: string, timestampMs: number): void {
  sessionTrackTimestamps.set(absoluteKey, timestampMs);
}

/** Clear all absolute-dedup timestamps (on session end). */
export function clearTrackTimestamps(): void {
  sessionTrackTimestamps.clear();
}
