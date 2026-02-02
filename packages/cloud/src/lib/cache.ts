/**
 * Cache Utilities
 *
 * LRU TTL cache for expensive operations
 */

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
  lastAccessed: number; // 🛡️ P2 Fix: Track access time for LRU eviction
}

const globalCache = new Map<string, CacheEntry<unknown>>();

const MAX_CACHE_SIZE = 1000;

/**
 * LRU TTL cache helper
 * Fetches data and caches it for the specified duration
 * 🛡️ P2 Fix: Implements proper LRU eviction (deletes least recently used entry)
 */
export async function withCache<T>(
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T>,
): Promise<T> {
  const cached = globalCache.get(key) as CacheEntry<T> | undefined;

  if (cached && cached.expiresAt > Date.now()) {
    // Update last accessed time on cache hit (for LRU)
    cached.lastAccessed = Date.now();
    return cached.data;
  }

  const data = await fetcher();

  // Eviction policy: If full, delete least recently used entry
  if (globalCache.size >= MAX_CACHE_SIZE) {
    let lruKey: string | null = null;
    let lruTime = Infinity;

    for (const [k, entry] of globalCache.entries()) {
      if (entry.lastAccessed < lruTime) {
        lruTime = entry.lastAccessed;
        lruKey = k;
      }
    }

    if (lruKey) globalCache.delete(lruKey);
  }

  const now = Date.now();
  globalCache.set(key, {
    data,
    expiresAt: now + ttlMs,
    lastAccessed: now,
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
