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

/**
 * Simple TTL cache helper
 * Fetches data and caches it for the specified duration
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
