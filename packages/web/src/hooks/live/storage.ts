/**
 * LocalStorage utilities for live session data persistence
 */
import { logger } from "@pika/shared";

// ============================================================================
// Liked Tracks Storage (scoped by session)
// ============================================================================

const LIKED_TRACKS_KEY = "pika_liked_tracks_v2";
const TEMPO_KEY_PREFIX = "pika_tempo_";
// Bound the per-session liked-tracks map so it can't grow without limit and
// eventually throw QuotaExceeded. /my-likes is server-backed, so this map is
// only in-session UI state (filled hearts on revisit) and safe to prune.
const MAX_LIKED_SESSIONS = 30;

interface LikedTracksStorage {
  [sessionId: string]: string[];
}

export function getStoredLikes(sessionId: string | null): Set<string> {
  if (typeof window === "undefined" || !sessionId) return new Set();
  try {
    const raw = localStorage.getItem(LIKED_TRACKS_KEY);
    if (!raw) return new Set();

    const data = JSON.parse(raw) as LikedTracksStorage;
    const sessionLikes = data[sessionId];

    return Array.isArray(sessionLikes) ? new Set(sessionLikes) : new Set();
  } catch (e) {
    logger.error("Failed to load liked tracks", e);
    return new Set();
  }
}

export function persistLikes(sessionId: string, tracks: Set<string>): void {
  if (typeof window === "undefined" || !sessionId) return;
  try {
    const raw = localStorage.getItem(LIKED_TRACKS_KEY);
    const data: LikedTracksStorage = raw ? JSON.parse(raw) : {};

    // Re-insert at the end so this session counts as most-recently-used.
    delete data[sessionId];
    data[sessionId] = [...tracks];

    // Bound the map to the most recent MAX_LIKED_SESSIONS sessions.
    const ids = Object.keys(data);
    for (const stale of ids.slice(0, Math.max(0, ids.length - MAX_LIKED_SESSIONS))) {
      delete data[stale];
    }

    localStorage.setItem(LIKED_TRACKS_KEY, JSON.stringify(data));
  } catch (e) {
    logger.error("Failed to save liked tracks", e);
  }
}

/**
 * One-shot localStorage maintenance for a live session. Bounds the two unbounded
 * structures so the PWA can't hit QuotaExceeded mid-event:
 *  - caps `pika_liked_tracks_v2` to the last MAX_LIKED_SESSIONS sessions (handles
 *    maps already bloated before this shipped);
 *  - drops `pika_tempo_*` keys for any session other than the current one — old-session
 *    tempo state is worthless once that set ended (the current session's keys are
 *    bounded by set length, so they're left alone).
 */
export function cleanupStaleLocalStorage(currentSessionId: string): void {
  if (typeof window === "undefined" || !currentSessionId) return;
  try {
    const raw = localStorage.getItem(LIKED_TRACKS_KEY);
    if (raw) {
      const data = JSON.parse(raw) as LikedTracksStorage;
      const ids = Object.keys(data);
      if (ids.length > MAX_LIKED_SESSIONS) {
        for (const stale of ids.slice(0, ids.length - MAX_LIKED_SESSIONS)) {
          delete data[stale];
        }
        localStorage.setItem(LIKED_TRACKS_KEY, JSON.stringify(data));
      }
    }

    // Anchored on a trailing "_" so a sessionId that is a prefix of another
    // (or contains underscores, e.g. e2e ids) can't false-match.
    const currentPrefix = `${TEMPO_KEY_PREFIX}${currentSessionId}_`;
    const staleTempoKeys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(TEMPO_KEY_PREFIX) && !key.startsWith(currentPrefix)) {
        staleTempoKeys.push(key);
      }
    }
    for (const key of staleTempoKeys) localStorage.removeItem(key);
  } catch (e) {
    logger.error("Failed to clean up stale localStorage", e);
  }
}

// ============================================================================
// Session ID Storage (for resuming sessions)
// ============================================================================

const LAST_SESSION_KEY = "pika_last_session_id";

export function getStoredSessionId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(LAST_SESSION_KEY);
}

export function persistSessionId(sessionId: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(LAST_SESSION_KEY, sessionId);
}

export function clearStoredSessionId(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(LAST_SESSION_KEY);
}
