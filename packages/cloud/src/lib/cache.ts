/**
 * Cache Utilities
 *
 * Simple TTL cache for expensive operations
 */

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const globalCache = new Map<string, CacheEntry<unknown>>();

const MAX_CACHE_SIZE = 1000;

/**
 * Simple TTL cache helper
 * Fetches data and caches it for the specified duration
 * Implements LRU-like eviction (deletes oldest entry when full)
 */
export async function withCache<T>(
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T>,
): Promise<T> {
  const cached = globalCache.get(key) as CacheEntry<T> | undefined;

  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const data = await fetcher();

  // Eviction policy: If full, delete oldest key (first inserted)
  if (globalCache.size >= MAX_CACHE_SIZE) {
    const oldestKey = globalCache.keys().next().value;
    if (oldestKey) globalCache.delete(oldestKey);
  }

  globalCache.set(key, {
    data,
    expiresAt: Date.now() + ttlMs,
  });

  return data;
}

/**
 * Invalidate a cache entry
 */
export function invalidateCache(key: string): void {
  globalCache.delete(key);
}

/**
 * Clear all cache entries
 */
export function clearCache(): void {
  globalCache.clear();
}

// Track cached counts to avoid redundant broadcasts
export const cachedListenerCounts = new Map<string, number>();
