/**
 * Listener Count Tracking (Per-Session) with Connection Reference Counting
 *
 * This module manages WebSocket listener counts for live sessions.
 * Uses "sticky" logic where participants stay counted for 5 minutes after disconnect.
 */

// Map: sessionId -> Map<clientId, { count: number; lastSeen: number }>
const sessionListeners = new Map<string, Map<string, { count: number; lastSeen: number }>>();

// Participants stay "active" in the count for 5 minutes after disconnect
const PARTICIPANT_TTL = 5 * 60 * 1000;

/**
 * Get the current listener count for a session
 * Only counts participants seen within the TTL window
 */
export function getListenerCount(sessionId: string): number {
  const clients = sessionListeners.get(sessionId);
  if (!clients) return 0;

  const now = Date.now();
  let count = 0;

  for (const [_clientId, data] of clients.entries()) {
    // Only count if:
    // 1. Still has active connections (count > 0), OR
    // 2. Was seen within TTL window (sticky logic)
    if (data.count > 0 || now - data.lastSeen < PARTICIPANT_TTL) {
      count++;
    }
  }

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

  // Production logging
  console.log(
    `👥 Listener added: ${clientId.substring(0, 8)}... (Active: ${client.count}, isNew: ${isNewDiscovery})`,
  );
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

  // Production logging
  console.log(
    `👥 Listener connection closed: ${clientId.substring(0, 8)}... (Remaining: ${client.count})`,
  );

  return false; // Never trigger immediate broadcast on disconnect
}

/**
 * Clear all listeners for a session
 */
export function clearListeners(sessionId: string): void {
  sessionListeners.delete(sessionId);
}

/**
 * Cleanup function for stale participants (disconnected > 1 hour)
 * Should be called periodically
 */
export function cleanupStaleListeners(): void {
  const now = Date.now();
  const CLEANUP_THRESHOLD = 60 * 60 * 1000; // 1 hour

  for (const [sessionId, clients] of sessionListeners.entries()) {
    for (const [clientId, data] of clients.entries()) {
      if (data.count === 0 && now - data.lastSeen > CLEANUP_THRESHOLD) {
        clients.delete(clientId);
      }
    }
    // 🧹 M3 Fix: Delete empty session entries from outer Map
    if (clients.size === 0) {
      sessionListeners.delete(sessionId);
      console.log(`🧹 [M3] Removed empty listener map for session ${sessionId}`);
    }
  }
}
