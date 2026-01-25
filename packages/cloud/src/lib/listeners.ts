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
export function getListenerCount(sessionId: string): number {
  const cache = listenerCountCache.get(sessionId);
  const now = Date.now();

  // If cache is fresh (1s), return it
  if (cache && now - cache.lastCalculated < 1000) {
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
}

/**
 * Cleanup function for stale participants (disconnected > 1 hour)
 * Should be called periodically
 */
export function cleanupStaleListeners(): void {
  const now = Date.now();
  const CLEANUP_THRESHOLD = 60 * 60 * 1000; // 1 hour

  for (const [sessionId, clients] of sessionListeners.entries()) {
    let hasDeleted = false;
    for (const [clientId, data] of clients.entries()) {
      if (data.count === 0 && now - data.lastSeen > CLEANUP_THRESHOLD) {
        clients.delete(clientId);
        hasDeleted = true;
      }
    }

    // M8: Re-calculate count after cleanup
    if (hasDeleted) {
      listenerCountCache.delete(sessionId);
    }

    // 🧹 M3 Fix: Delete empty session entries from outer Map
    if (clients.size === 0) {
      sessionListeners.delete(sessionId);
      listenerCountCache.delete(sessionId);
      logger.debug("🧹 Removed empty listener map", { sessionId });
    }
  }
}
