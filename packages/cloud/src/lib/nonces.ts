/**
 * Nonce Deduplication
 *
 * @file nonces.ts
 * @package @pika/cloud
 * @created 2026-01-21
 *
 * PURPOSE:
 * Tracks recently seen message nonces to prevent duplicate
 * processing from network retries or replay attacks.
 *
 * FUTURE:
 * Can swap Map for Redis SETEX for distributed deduplication.
 */

// ============================================================================
// Types
// ============================================================================

interface NonceEntry {
  timestamp: number;
  sessionId: string;
}

// ============================================================================
// Constants
// ============================================================================

const NONCE_TTL_MS = 5 * 60 * 1000; // Nonces expire after 5 minutes
const MAX_NONCES = 10000; // Hard limit to prevent memory exhaustion
const CLEANUP_INTERVAL_MS = 60000; // Every minute

// ============================================================================
// State
// ============================================================================

const seenNonces = new Map<string, NonceEntry>();

// ============================================================================
// Operations
// ============================================================================

/**
 * Check if a message nonce has been seen before (deduplication)
 * @returns true if this nonce is NEW (should be processed), false if duplicate
 */
export function checkAndRecordNonce(nonce: string | undefined, sessionId: string): boolean {
  if (!nonce) return true; // No nonce = no deduplication (legacy clients)

  // S0.3.3 Fix: Atomic check-and-set pattern
  if (seenNonces.has(nonce)) {
    console.log(
      `🔄 Duplicate nonce detected: ${nonce.substring(0, 16)}... (session: ${sessionId})`,
    );
    return false;
  }

  // Enforce max nonces (FIFO eviction)
  if (seenNonces.size >= MAX_NONCES) {
    const oldestKey = seenNonces.keys().next().value;
    if (oldestKey) seenNonces.delete(oldestKey);
  }

  // Record this nonce
  seenNonces.set(nonce, { timestamp: Date.now(), sessionId });
  return true;
}

/**
 * Clean up expired nonces
 * @returns number of nonces cleaned
 */
export function cleanupExpiredNonces(): number {
  const now = Date.now();
  let cleaned = 0;

  for (const [nonce, entry] of seenNonces.entries()) {
    if (now - entry.timestamp > NONCE_TTL_MS) {
      seenNonces.delete(nonce);
      cleaned++;
    }
  }

  if (cleaned > 0) {
    console.log(`🧹 Cleaned ${cleaned} expired nonces (remaining: ${seenNonces.size})`);
  }

  return cleaned;
}

/**
 * Get current nonce count (for monitoring)
 */
export function getNonceCount(): number {
  return seenNonces.size;
}

/**
 * Clear all nonces (for testing)
 */
export function clearNonces(): void {
  seenNonces.clear();
}

// ============================================================================
// Periodic Cleanup
// ============================================================================

// Start cleanup interval
setInterval(cleanupExpiredNonces, CLEANUP_INTERVAL_MS);

// Export constants for testing
export { NONCE_TTL_MS, MAX_NONCES };
