/**
 * Session State Management
 *
 * @file sessions.ts
 * @package @pika/cloud
 * @created 2026-01-21
 *
 * PURPOSE:
 * Manages active DJ sessions in memory. Provides CRUD operations
 * for session state used by WebSocket handlers.
 *
 * FUTURE:
 * Interface allows swapping Map for Redis without handler changes.
 */

import type { TrackInfo } from "@pika/shared";

// ============================================================================
// Types
// ============================================================================

export interface Announcement {
  message: string;
  timestamp: string;
  endsAt?: string;
}

export interface LiveSession {
  sessionId: string;
  djName: string;
  startedAt: string;
  currentTrack?: TrackInfo;
  activeAnnouncement?: Announcement | null;
}

// ============================================================================
// State (In-Memory — Redis-ready interface)
// ============================================================================

const activeSessions = new Map<string, LiveSession>();

// ============================================================================
// Operations
// ============================================================================

/**
 * Get a session by ID
 */
export function getSession(sessionId: string): LiveSession | undefined {
  const session = activeSessions.get(sessionId);
  console.log(`🔍 [SESSIONS] getSession(${sessionId}): ${session ? "FOUND" : "NOT FOUND"} (total: ${activeSessions.size})`);
  return session;
}

/**
 * Set/update a session
 */
export function setSession(sessionId: string, session: LiveSession): void {
  const wasNew = !activeSessions.has(sessionId);
  activeSessions.set(sessionId, session);
  console.log(`🔍 [SESSIONS] setSession(${sessionId}): ${wasNew ? "NEW" : "UPDATE"} - DJ: ${session.djName} (total: ${activeSessions.size})`);
}

/**
 * Delete a session
 */
export function deleteSession(sessionId: string): boolean {
  const existed = activeSessions.has(sessionId);
  const result = activeSessions.delete(sessionId);
  console.log(`🔍 [SESSIONS] deleteSession(${sessionId}): ${existed ? "DELETED" : "NOT FOUND"} (total: ${activeSessions.size})`);
  return result;
}

/**
 * Check if session exists
 */
export function hasSession(sessionId: string): boolean {
  return activeSessions.has(sessionId);
}

/**
 * Get all active sessions
 */
export function getAllSessions(): LiveSession[] {
  return Array.from(activeSessions.values());
}

/**
 * Get all session IDs
 */
export function getSessionIds(): string[] {
  return Array.from(activeSessions.keys());
}

/**
 * Get count of active sessions
 */
export function getSessionCount(): number {
  return activeSessions.size;
}

/**
 * Update current track for a session
 */
export function updateSessionTrack(sessionId: string, track: TrackInfo): boolean {
  const session = activeSessions.get(sessionId);
  if (!session) return false;
  session.currentTrack = track;
  return true;
}

/**
 * Set announcement for a session
 */
export function setSessionAnnouncement(
  sessionId: string,
  announcement: Announcement | null,
): boolean {
  const session = activeSessions.get(sessionId);
  if (!session) return false;
  session.activeAnnouncement = announcement;
  return true;
}

/**
 * Clean up stale sessions that have been running for too long
 * (likely orphaned due to missed cleanup on disconnect)
 *
 * @param maxAgeMs Maximum session age in milliseconds (default: 8 hours)
 * @returns Array of removed session IDs
 */
export function cleanupStaleSessions(maxAgeMs = 8 * 60 * 60 * 1000): string[] {
  const now = Date.now();
  const removed: string[] = [];

  for (const [sessionId, session] of activeSessions) {
    const startedAt = new Date(session.startedAt).getTime();
    const age = now - startedAt;

    if (age > maxAgeMs) {
      console.warn(
        `🧹 [SESSIONS] Removing stale session: ${sessionId} (DJ: ${session.djName}, age: ${Math.round(age / 1000 / 60)} minutes)`
      );
      activeSessions.delete(sessionId);
      removed.push(sessionId);
    }
  }

  if (removed.length > 0) {
    console.log(`🧹 [SESSIONS] Cleaned up ${removed.length} stale session(s). Remaining: ${activeSessions.size}`);
  }

  return removed;
}
