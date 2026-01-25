/**
 * Listener Count Tracking (Per-Session) with Connection Reference Counting
 *
 * This module manages WebSocket listener counts for live sessions.
 * Uses "sticky" logic where participants stay counted for 5 minutes after disconnect.
 */
import { logger } from "@pika/shared";

// Map: sessionId -> Map<clientId, { count: number; lastSeen: number }>
const sessionListeners = new Map<string, Map<string, { count: number; lastSeen: number }>>();

// M8: Cache the listener count per session to avoid O(n) scans in the broadcast loop
// Map: sessionId -> { count: number; lastCalculated: number }
const listenerCountCache = new Map<string, { count: number; lastCalculated: number }>();

// Participants stay "active" in the count for 5 minutes after disconnect
const PARTICIPANT_TTL = 5 * 60 * 1000;

/**
 * Get the current listener count for a session
 * M8: Uses a cached value if calculated within the last 1s
 */
// Map: sessionId -> Set<clientId> of potentially stale listeners (count = 0)
const staleCandidates = new Map<string, Set<string>>();

/**
 * Get the current listener count for a session
 * M8: Uses a cached value if calculated within the last 1s
 */
export function getListenerCount(sessionId: string): number {
  const cache = listenerCountCache.get(sessionId);
  const now = Date.now();

  // If cache is fresh (100ms), return it
  if (cache && now - cache.lastCalculated < 100) {
    return cache.count;
  }

  const clients = sessionListeners.get(sessionId);
  if (!clients) return 0;

  let count = 0;
  for (const [_clientId, data] of clients.entries()) {
    if (data.count > 0 || now - data.lastSeen < PARTICIPANT_TTL) {
      count++;
    }
  }

  // Update cache
  listenerCountCache.set(sessionId, { count, lastCalculated: now });
  return count;
}

/**
 * Add listener connection to a session (increments reference count)
 * Returns true if this is a NEW discovery (not seen in sticky window)
 */
export function addListener(sessionId: string, clientId: string): boolean {
  if (!sessionListeners.has(sessionId)) {
    sessionListeners.set(sessionId, new Map());
  }
  const clients = sessionListeners.get(sessionId)!;
  const now = Date.now();

  // Production behavior: get existing or create new entry
  const client = clients.get(clientId) || { count: 0, lastSeen: 0 };

  // Production check: new discovery only if count is 0 AND outside TTL window
  const isNewDiscovery = client.count === 0 && now - client.lastSeen > PARTICIPANT_TTL;

  client.count++;
  client.lastSeen = now;
  clients.set(clientId, client);

  // Remove from stale candidates if present (reconnected)
  const sessionStale = staleCandidates.get(sessionId);
  if (sessionStale) {
    sessionStale.delete(clientId);
    if (sessionStale.size === 0) staleCandidates.delete(sessionId);
  }

  // M8: Invalidate cache
  listenerCountCache.delete(sessionId);

  // Production logging
  logger.debug("👥 Listener added", {
    clientId: clientId.substring(0, 8),
    refCount: client.count,
    isNew: isNewDiscovery,
  });

  return isNewDiscovery;
}

/**
 * Remove listener connection from a session (decrements reference count)
 * Returns false (we don't broadcast drops immediately due to sticky logic)
 */
export function removeListener(sessionId: string, clientId: string): boolean {
  const clients = sessionListeners.get(sessionId);
  if (!clients) return false;

  const client = clients.get(clientId);
  if (!client) return false;

  // Decrement reference count but DON'T remove - we keep them for sticky period
  client.count = Math.max(0, client.count - 1);
  client.lastSeen = Date.now();

  // If count is 0, mark as potentially stale
  if (client.count === 0) {
    if (!staleCandidates.has(sessionId)) {
      staleCandidates.set(sessionId, new Set());
    }
    staleCandidates.get(sessionId)!.add(clientId);
  }

  // M8: Invalidate cache
  listenerCountCache.delete(sessionId);

  // Production logging
  logger.debug("👥 Listener connection closed", {
    clientId: clientId.substring(0, 8),
    remainingRef: client.count,
  });

  return false; // Never trigger immediate broadcast on disconnect
}

/**
 * Clear all listeners for a session
 */
export function clearListeners(sessionId: string): void {
  sessionListeners.delete(sessionId);
  listenerCountCache.delete(sessionId);
  staleCandidates.delete(sessionId);
}

/**
 * Cleanup function for stale participants (disconnected > 1 hour)
 * Should be called periodically
 *
 * 🛡️ Issue 38 Fix: O(Disconnected) complexity instead of O(N*M)
 * Uses staleCandidates index to only check clients that are explicitly disconnected.
 */
export function cleanupStaleListeners(): void {
  const now = Date.now();
  const CLEANUP_THRESHOLD = 60 * 60 * 1000; // 1 hour

  for (const [sessionId, clientIds] of staleCandidates.entries()) {
    const clients = sessionListeners.get(sessionId);

    // If session is gone, just cleanup invalid candidate entry
    if (!clients) {
      staleCandidates.delete(sessionId);
      continue;
    }

    let hasDeleted = false;

    // Check only candidates
    for (const clientId of clientIds) {
      const data = clients.get(clientId);

      // If client reconnected (count > 0) or is missing, remove from candidates
      if (!data || data.count > 0) {
        clientIds.delete(clientId);
        continue;
      }

      // If stale check passes, delete for real
      if (now - data.lastSeen > CLEANUP_THRESHOLD) {
        clients.delete(clientId);
        clientIds.delete(clientId); // Remove from candidates too
        hasDeleted = true;
      }
    }

    // Clean up empty candidate sets
    if (clientIds.size === 0) {
      staleCandidates.delete(sessionId);
    }

    // M8: Re-calculate count cache if we modified subscribers
    if (hasDeleted) {
      listenerCountCache.delete(sessionId);
    }

    // 🧹 M3 Fix: Delete empty session entries from outer Map
    if (clients.size === 0) {
      sessionListeners.delete(sessionId);
      listenerCountCache.delete(sessionId);
      // Also ensure candidates are gone (should be handled above but for safety)
      staleCandidates.delete(sessionId);
      logger.debug("🧹 Removed empty listener map", { sessionId });
    }
  }
}
