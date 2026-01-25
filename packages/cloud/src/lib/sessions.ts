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
import { logger } from "@pika/shared";

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
  lastActivityAt: string;
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
  logger.debug("🔍 [SESSIONS] getSession", {
    sessionId,
    found: !!session,
    total: activeSessions.size,
  });
  return session;
}

/**
 * Set/update a session
 */
export function setSession(sessionId: string, session: LiveSession): void {
  const wasNew = !activeSessions.has(sessionId);
  // Ensure lastActivityAt is set if not provided
  if (!session.lastActivityAt) {
    session.lastActivityAt = new Date().toISOString();
  }
  activeSessions.set(sessionId, session);
  logger.debug("🔍 [SESSIONS] setSession", {
    sessionId,
    wasNew,
    djName: session.djName,
    total: activeSessions.size,
  });
}

/**
 * Update activity timestamp for a session
 */
export function refreshSessionActivity(sessionId: string): void {
  const session = activeSessions.get(sessionId);
  if (session) {
    session.lastActivityAt = new Date().toISOString();
  }
}

/**
 * Delete a session
 */
export function deleteSession(sessionId: string): boolean {
  const existed = activeSessions.has(sessionId);
  const result = activeSessions.delete(sessionId);
  logger.debug("🔍 [SESSIONS] deleteSession", {
    sessionId,
    existed,
    total: activeSessions.size,
  });
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
  session.lastActivityAt = new Date().toISOString();
  return true;
}

/**
 * Clear the current track for a session
 */
export function clearSessionTrack(sessionId: string): boolean {
  const session = activeSessions.get(sessionId);
  if (!session) return false;
  delete session.currentTrack;
  session.lastActivityAt = new Date().toISOString();
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
  session.lastActivityAt = new Date().toISOString();
  return true;
}

/**
 * Clean up stale sessions using a Smart Buffer strategy.
 *
 * 11/10 Magic Plan:
 * - Kill if (Idle > 4h AND Age > 8h)
 * - OR Kill if (Age > 24h) - Hard limit
 *
 * @param idleTimeoutMs Max idle time (default: 4 hours)
 * @param ageThresholdMs Age after which idle check applies (default: 8 hours)
 * @param hardLimitMs Max absolute session age (default: 24 hours)
 * @returns Array of removed session IDs
 */
export function cleanupStaleSessions(
  idleTimeoutMs = 4 * 60 * 60 * 1000,
  ageThresholdMs = 8 * 60 * 60 * 1000,
  hardLimitMs = 24 * 60 * 60 * 1000,
): string[] {
  const now = Date.now();
  const removed: string[] = [];

  for (const [sessionId, session] of activeSessions) {
    const startedAt = new Date(session.startedAt).getTime();
    const lastActivity = new Date(session.lastActivityAt).getTime();
    const age = now - startedAt;
    const idleTime = now - lastActivity;

    const shouldCleanup = (idleTime > idleTimeoutMs && age > ageThresholdMs) || age > hardLimitMs;

    if (shouldCleanup) {
      logger.info("🧹 Removing stale session", {
        sessionId,
        djName: session.djName,
        ageMinutes: Math.round(age / 1000 / 60),
        idleMinutes: Math.round(idleTime / 1000 / 60),
      });
      activeSessions.delete(sessionId);
      removed.push(sessionId);
    }
  }

  if (removed.length > 0) {
    logger.info("🧹 Stale sessions cleanup complete", {
      count: removed.length,
      remaining: activeSessions.size,
    });
  }

  return removed;
}
