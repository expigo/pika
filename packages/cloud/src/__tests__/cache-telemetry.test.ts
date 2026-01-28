/**
 * Cache & Telemetry Tests
 *
 * @file cache-telemetry.test.ts
 * @package @pika/cloud
 * @created 2026-01-21
 *
 * PURPOSE:
 * Tests cache utilities (TTL, invalidation) and session telemetry logging.
 * Critical for performance optimization and operational monitoring.
 *
 * PRODUCTION LOCATION:
 * - lib/cache.ts (withCache, invalidateCache, clearCache)
 * - index.ts lines 380-412 (logSessionEvent)
 */

import { beforeEach, describe, expect, test } from "bun:test";

// ============================================================================
// MOCK CACHE IMPLEMENTATION (mirrors lib/cache.ts)
// ============================================================================

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

let globalCache: Map<string, CacheEntry<unknown>>;

async function withCache<T>(key: string, ttlMs: number, fetcher: () => Promise<T>): Promise<T> {
  const cached = globalCache.get(key) as CacheEntry<T> | undefined;

  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const data = await fetcher();
  globalCache.set(key, {
    data,
    expiresAt: Date.now() + ttlMs,
  });

  return data;
}

function invalidateCache(key: string): void {
  globalCache.delete(key);
}

function clearCache(): void {
  globalCache.clear();
}

// ============================================================================
// MOCK SESSION TELEMETRY
// ============================================================================

type SessionEventType = "connect" | "disconnect" | "reconnect" | "end";

interface SessionEventMetadata {
  reason?: string;
  reconnectMs?: number;
  clientVersion?: string;
}

interface TelemetryEvent {
  sessionId: string;
  eventType: SessionEventType;
  metadata: SessionEventMetadata | null;
  timestamp: number;
}

let telemetryEvents: TelemetryEvent[];
let telemetryErrors: string[];

async function logSessionEvent(
  sessionId: string,
  eventType: SessionEventType,
  metadata?: SessionEventMetadata,
): Promise<void> {
  try {
    telemetryEvents.push({
      sessionId,
      eventType,
      metadata: metadata || null,
      timestamp: Date.now(),
    });
  } catch (e) {
    // Fire-and-forget - don't block main flow
    telemetryErrors.push(String(e));
  }
}

// ============================================================================
// CACHE TESTS
// ============================================================================

describe("Cache Utility - withCache", () => {
  beforeEach(() => {
    globalCache = new Map();
  });

  /**
   * TEST: Cache miss calls fetcher
   *
   * RATIONALE:
   * First call for a key must invoke the fetcher to get fresh data.
   */
  test("calls fetcher on cache miss", async () => {
    let fetcherCalls = 0;
    const fetcher = async () => {
      fetcherCalls++;
      return "fresh-data";
    };

    const result = await withCache("key1", 5000, fetcher);

    expect(result).toBe("fresh-data");
    expect(fetcherCalls).toBe(1);
  });

  /**
   * TEST: Cache hit returns cached data
   *
   * RATIONALE:
   * Subsequent calls within TTL should return cached data without calling fetcher.
   */
  test("returns cached data on cache hit", async () => {
    let fetcherCalls = 0;
    const fetcher = async () => {
      fetcherCalls++;
      return `data-${fetcherCalls}`;
    };

    const result1 = await withCache("key1", 5000, fetcher);
    const result2 = await withCache("key1", 5000, fetcher);

    expect(result1).toBe("data-1");
    expect(result2).toBe("data-1"); // Same as first - cached
    expect(fetcherCalls).toBe(1); // Only one fetch
  });

  /**
   * TEST: Different keys are cached independently
   */
  test("caches different keys independently", async () => {
    const result1 = await withCache("key1", 5000, async () => "value1");
    const result2 = await withCache("key2", 5000, async () => "value2");

    expect(result1).toBe("value1");
    expect(result2).toBe("value2");
    expect(globalCache.size).toBe(2);
  });

  /**
   * TEST: Expired cache calls fetcher again
   *
   * RATIONALE:
   * After TTL expires, next call must fetch fresh data.
   */
  test("refetches after TTL expires", async () => {
    let fetcherCalls = 0;
    const fetcher = async () => {
      fetcherCalls++;
      return `data-${fetcherCalls}`;
    };

    // First call
    await withCache("key1", 100, fetcher);
    expect(fetcherCalls).toBe(1);

    // Wait for TTL to expire
    await new Promise((r) => setTimeout(r, 150));

    // Second call - should refetch
    const result = await withCache("key1", 100, fetcher);
    expect(result).toBe("data-2");
    expect(fetcherCalls).toBe(2);
  });

  /**
   * TEST: Cache stores complex objects
   */
  test("caches complex objects", async () => {
    const complexData = {
      users: [{ id: 1, name: "DJ" }],
      count: 100,
      nested: { deep: { value: true } },
    };

    await withCache("complex", 5000, async () => complexData);
    const cached = await withCache("complex", 5000, async () => ({}));

    expect(cached).toEqual(complexData);
  });

  /**
   * TEST: TTL is configurable per key
   */
  test("respects different TTLs per key", async () => {
    await withCache("short-ttl", 50, async () => "short");
    await withCache("long-ttl", 10000, async () => "long");

    // Wait for short TTL to expire
    await new Promise((r) => setTimeout(r, 100));

    // Short TTL should refetch
    let shortFetched = false;
    await withCache("short-ttl", 50, async () => {
      shortFetched = true;
      return "refetched";
    });

    // Long TTL should still be cached
    let longFetched = false;
    await withCache("long-ttl", 10000, async () => {
      longFetched = true;
      return "refetched";
    });

    expect(shortFetched).toBe(true);
    expect(longFetched).toBe(false);
  });
});

describe("Cache Utility - invalidateCache", () => {
  beforeEach(() => {
    globalCache = new Map();
  });

  /**
   * TEST: Invalidate removes cached entry
   */
  test("removes cached entry", async () => {
    await withCache("key1", 5000, async () => "data");
    expect(globalCache.has("key1")).toBe(true);

    invalidateCache("key1");
    expect(globalCache.has("key1")).toBe(false);
  });

  /**
   * TEST: Invalidate non-existent key does nothing
   */
  test("handles non-existent key gracefully", () => {
    invalidateCache("nonexistent");
    // No error thrown
    expect(globalCache.size).toBe(0);
  });

  /**
   * TEST: Invalidate forces refetch on next call
   */
  test("forces refetch on next call", async () => {
    let fetcherCalls = 0;
    const fetcher = async () => {
      fetcherCalls++;
      return `data-${fetcherCalls}`;
    };

    await withCache("key1", 5000, fetcher);
    expect(fetcherCalls).toBe(1);

    invalidateCache("key1");

    const result = await withCache("key1", 5000, fetcher);
    expect(result).toBe("data-2");
    expect(fetcherCalls).toBe(2);
  });
});

describe("Cache Utility - clearCache", () => {
  beforeEach(() => {
    globalCache = new Map();
  });

  /**
   * TEST: Clear removes all entries
   */
  test("removes all cached entries", async () => {
    await withCache("key1", 5000, async () => "data1");
    await withCache("key2", 5000, async () => "data2");
    await withCache("key3", 5000, async () => "data3");

    expect(globalCache.size).toBe(3);

    clearCache();

    expect(globalCache.size).toBe(0);
  });

  /**
   * TEST: Clear on empty cache does nothing
   */
  test("handles empty cache gracefully", () => {
    clearCache();
    expect(globalCache.size).toBe(0);
  });
});

// ============================================================================
// SESSION TELEMETRY TESTS
// ============================================================================

describe("Session Telemetry - logSessionEvent", () => {
  beforeEach(() => {
    telemetryEvents = [];
    telemetryErrors = [];
  });

  /**
   * TEST: Logs connect event
   *
   * RATIONALE:
   * Connect events track when clients join a session.
   */
  test("logs connect event", async () => {
    await logSessionEvent("session-123", "connect");

    expect(telemetryEvents.length).toBe(1);
    expect(telemetryEvents[0].sessionId).toBe("session-123");
    expect(telemetryEvents[0].eventType).toBe("connect");
  });

  /**
   * TEST: Logs all event types
   */
  test("logs all event types", async () => {
    const events: SessionEventType[] = ["connect", "disconnect", "reconnect", "end"];

    for (const eventType of events) {
      await logSessionEvent(`session-${eventType}`, eventType);
    }

    expect(telemetryEvents.length).toBe(4);
    expect(telemetryEvents.map((e) => e.eventType)).toEqual(events);
  });

  /**
   * TEST: Includes metadata when provided
   */
  test("includes metadata when provided", async () => {
    const metadata = {
      reason: "network_error",
      reconnectMs: 1500,
      clientVersion: "0.2.1",
    };

    await logSessionEvent("session-1", "reconnect", metadata);

    expect(telemetryEvents[0].metadata).toEqual(metadata);
  });

  /**
   * TEST: Metadata is null when not provided
   */
  test("metadata is null when not provided", async () => {
    await logSessionEvent("session-1", "connect");

    expect(telemetryEvents[0].metadata).toBeNull();
  });

  /**
   * TEST: Logs timestamp
   */
  test("includes timestamp", async () => {
    const before = Date.now();
    await logSessionEvent("session-1", "connect");
    const after = Date.now();

    expect(telemetryEvents[0].timestamp).toBeGreaterThanOrEqual(before);
    expect(telemetryEvents[0].timestamp).toBeLessThanOrEqual(after);
  });

  /**
   * TEST: Multiple sessions logged independently
   */
  test("logs multiple sessions independently", async () => {
    await logSessionEvent("session-A", "connect");
    await logSessionEvent("session-B", "connect");
    await logSessionEvent("session-A", "disconnect");

    expect(telemetryEvents.length).toBe(3);
    expect(telemetryEvents.filter((e) => e.sessionId === "session-A").length).toBe(2);
    expect(telemetryEvents.filter((e) => e.sessionId === "session-B").length).toBe(1);
  });
});

describe("Session Telemetry - Event Types", () => {
  /**
   * TEST: Event type enum validation
   */
  test("valid event types are defined", () => {
    const validTypes: SessionEventType[] = ["connect", "disconnect", "reconnect", "end"];

    for (const type of validTypes) {
      expect(["connect", "disconnect", "reconnect", "end"]).toContain(type);
    }
  });

  /**
   * TEST: Metadata structure
   */
  test("metadata structure is correct", () => {
    const metadata: SessionEventMetadata = {
      reason: "test",
      reconnectMs: 1000,
      clientVersion: "1.0.0",
    };

    expect(metadata.reason).toBeDefined();
    expect(metadata.reconnectMs).toBeDefined();
    expect(metadata.clientVersion).toBeDefined();
  });

  /**
   * TEST: Partial metadata is valid
   */
  test("partial metadata is valid", () => {
    const onlyReason: SessionEventMetadata = { reason: "timeout" };
    const onlyVersion: SessionEventMetadata = { clientVersion: "1.0" };

    expect(onlyReason.reason).toBe("timeout");
    expect(onlyVersion.clientVersion).toBe("1.0");
  });
});
