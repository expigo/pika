/**
 * LocalStorage utilities for live session data persistence
 */

// ============================================================================
// Liked Tracks Storage (scoped by session)
// ============================================================================

const LIKED_TRACKS_KEY = "pika_liked_tracks_v2";

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
    console.error("Failed to load liked tracks:", e);
    return new Set();
  }
}

export function persistLikes(sessionId: string, tracks: Set<string>): void {
  if (typeof window === "undefined" || !sessionId) return;
  try {
    const raw = localStorage.getItem(LIKED_TRACKS_KEY);
    const data: LikedTracksStorage = raw ? JSON.parse(raw) : {};

    data[sessionId] = [...tracks];
    localStorage.setItem(LIKED_TRACKS_KEY, JSON.stringify(data));
  } catch (e) {
    console.error("Failed to save liked tracks:", e);
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
