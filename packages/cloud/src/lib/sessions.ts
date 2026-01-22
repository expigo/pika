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
  return activeSessions.get(sessionId);
}

/**
 * Set/update a session
 */
export function setSession(sessionId: string, session: LiveSession): void {
  activeSessions.set(sessionId, session);
}

/**
 * Delete a session
 */
export function deleteSession(sessionId: string): boolean {
  return activeSessions.delete(sessionId);
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
