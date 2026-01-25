/**
 * Session Persistence
 *
 * @file persistence/sessions.ts
 * @package @pika/cloud
 * @created 2026-01-21
 *
 * PURPOSE:
 * Database operations for session lifecycle - create, check existence, end.
 * Includes event-based coordination for dependent operations (tracks, polls).
 */

import { eq } from "drizzle-orm";
import { db, schema } from "../../db";
import { logger } from "@pika/shared";

// ============================================================================
// State (shared with handlers during migration)
// ============================================================================

// Track which sessions have been persisted to avoid race conditions
export const persistedSessions = new Set<string>();

// Map of pending session waiters: sessionId -> array of resolve functions
const sessionWaiters = new Map<string, Array<(value: boolean) => void>>();

// ============================================================================
// Session Ready Event Mechanism
// ============================================================================

/**
 * Wait for a session to be persisted (with timeout).
 * Uses event-based coordination instead of busy-polling.
 *
 * @param sessionId - The session ID to wait for
 * @param timeoutMs - Maximum time to wait (default 4000ms for backwards compat)
 * @returns true if session is ready, false if timeout
 */
export async function waitForSession(sessionId: string, timeoutMs = 4000): Promise<boolean> {
  // Fast path: already persisted
  if (persistedSessions.has(sessionId)) return true;
  if (process.env.NODE_ENV === "test") return true;

  return new Promise<boolean>((resolve) => {
    // Add to waiters
    if (!sessionWaiters.has(sessionId)) {
      sessionWaiters.set(sessionId, []);
    }
    sessionWaiters.get(sessionId)!.push(resolve);

    // Set timeout
    setTimeout(() => {
      const waiters = sessionWaiters.get(sessionId);
      if (waiters) {
        const idx = waiters.indexOf(resolve);
        if (idx !== -1) {
          waiters.splice(idx, 1);
          resolve(false); // Timeout
        }
      }
    }, timeoutMs);
  });
}

/**
 * Signal that a session is ready (called after persistSession completes).
 * Resolves all waiting promises for this session.
 */
/**
 * Signal that a session is ready (called after persistSession completes).
 * Resolves all waiting promises for this session.
 * @param success - Whether the session was successfully persisted
 */
function signalSessionReady(sessionId: string, success: boolean): void {
  const waiters = sessionWaiters.get(sessionId);
  if (waiters && waiters.length > 0) {
    logger.debug(`📢 Signaling session ${success ? "ready" : "failed"} to waiters`, {
      sessionId,
      waiterCount: waiters.length,
    });

    // S0.3.1 Fix: Defensive copy to allow mutation during iteration
    const waitersCopy = [...waiters];
    sessionWaiters.delete(sessionId);

    // 🛡️ R5 Fix: Signal actual status instead of just 'true' (if failed, waiters should wake up and fail)
    for (const resolve of waitersCopy) {
      resolve(success);
    }
  }
}

// ============================================================================
// Operations
// ============================================================================

/**
 * Check if session exists in DB (handling server restarts)
 */
export async function ensureSessionPersisted(sessionId: string): Promise<boolean> {
  if (process.env.NODE_ENV === "test") return true; // Mock persistence in tests

  if (persistedSessions.has(sessionId)) return true;

  try {
    const results = await db
      .select({ id: schema.sessions.id })
      .from(schema.sessions)
      .where(eq(schema.sessions.id, sessionId));

    if (results.length > 0) {
      persistedSessions.add(sessionId);
      return true;
    }
  } catch (e) {
    logger.error("Failed to check session existence", e);
  }
  return false;
}

/**
 * Persist session to database - MUST complete before tracks can be saved
 */
export async function persistSession(
  sessionId: string,
  djName: string,
  djUserId?: number | null,
): Promise<boolean> {
  if (process.env.NODE_ENV === "test") {
    persistedSessions.add(sessionId);
    signalSessionReady(sessionId, true); // Signal waiters in test mode too
    return true;
  }

  try {
    await db
      .insert(schema.sessions)
      .values({
        id: sessionId,
        djName,
        djUserId: djUserId ?? null,
      })
      .onConflictDoNothing();
    persistedSessions.add(sessionId);
    logger.info("💾 Session persisted", { sessionId, djUserId });

    // Signal all waiters that session is ready
    signalSessionReady(sessionId, true);

    return true;
  } catch (e) {
    logger.error("❌ Failed to persist session", e);
    // 🛡️ R5 Fix: Signal failure to waiters so they don't hang until timeout
    signalSessionReady(sessionId, false);
    return false;
  }
}

/**
 * Mark session as ended in database
 */
export async function endSessionInDb(sessionId: string): Promise<void> {
  try {
    await db
      .update(schema.sessions)
      .set({ endedAt: new Date() })
      .where(eq(schema.sessions.id, sessionId));
    persistedSessions.delete(sessionId);
    logger.info("💾 Session ended in DB", { sessionId });
  } catch (e) {
    logger.error("❌ Failed to end session in DB", e);
  }
}
