/**
 * Per-client sliding-window rate limiter.
 *
 * @file rate-limit.ts
 * @package @pika/cloud
 *
 * PURPOSE:
 * Bounds how often a single client (keyed by clientId) may trigger an action
 * within a rolling time window. Used for amplifying WebSocket messages
 * (likes, reactions, tempo votes, bulk-like flushes) where one inbound message
 * fans out to every subscriber of a session topic — without a per-client cap a
 * single scripted socket can drive unbounded broadcast load.
 *
 * Memory is bounded by periodic {@link ClientRateLimiter.cleanup}: a client whose
 * most recent hit is older than the window is dropped wholesale.
 *
 * FUTURE:
 * Swap the Map for Redis (e.g. sorted-set per client) for distributed limiting.
 */

export class ClientRateLimiter {
  // clientId -> ascending timestamps (ms) of hits still inside the window
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
  ) {}

  /**
   * Record an attempt for a client.
   * @returns true if the attempt is within the limit (allow), false if the
   *   client has reached `max` hits inside the window (reject). A rejected
   *   attempt is NOT counted, so the limiter can't lock a client out forever.
   */
  check(clientId: string): boolean {
    const now = Date.now();
    const recent = (this.hits.get(clientId) ?? []).filter((t) => now - t < this.windowMs);

    if (recent.length >= this.max) {
      // Persist the pruned window so memory doesn't grow on a hot, blocked client.
      this.hits.set(clientId, recent);
      return false;
    }

    recent.push(now);
    this.hits.set(clientId, recent);
    return true;
  }

  /**
   * Drop clients whose newest hit has aged out of the window.
   * @returns number of client entries removed (for observability).
   */
  cleanup(): number {
    const now = Date.now();
    let removed = 0;
    for (const [clientId, timestamps] of this.hits.entries()) {
      const newest = timestamps[timestamps.length - 1];
      if (newest === undefined || now - newest > this.windowMs) {
        this.hits.delete(clientId);
        removed++;
      }
    }
    return removed;
  }

  /** Current number of tracked clients (for monitoring/tests). */
  get size(): number {
    return this.hits.size;
  }

  /** Clear all state (for tests). */
  clear(): void {
    this.hits.clear();
  }
}
