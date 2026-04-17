import Redis from "ioredis";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

export const redis = new Redis(REDIS_URL, {
  retryStrategy: times => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  maxRetriesPerRequest: 3,
});

redis.on("error", err => {
  console.error("Redis error:", err);
});

redis.on("connect", () => {
  console.log("Redis connected");
});

// Cache TTL constants (in seconds)
export const CACHE_TTL = {
  DASHBOARD_STATS: 60, // 1 minute
  USER_COLLECTIONS: 30, // 30 seconds
  COMPLIANCE_SCORES: 300, // 5 minutes
  SCAN_RESULTS: 60, // 1 minute
};

// Generate cache keys
export const cacheKeys = {
  dashboardStats: (userId: number) => `dashboard:stats:${userId}`,
  userCollections: (userId: number) => `collections:list:${userId}`,
  complianceScore: (reportId: string) => `compliance:score:${reportId}`,
  scanResults: (scanId: string) => `scan:results:${scanId}`,
};

// Cache wrapper function
export async function getOrSetCache<T>(
  key: string,
  ttl: number,
  fetchFn: () => Promise<T>
): Promise<T> {
  try {
    // Try to get from cache
    const cached = await redis.get(key);
    if (cached) {
      return JSON.parse(cached);
    }

    // Fetch fresh data
    const data = await fetchFn();

    // Store in cache
    await redis.setex(key, ttl, JSON.stringify(data));

    return data;
  } catch (error) {
    // Fallback to direct fetch if Redis fails
    console.warn("Cache fetch failed, returning fresh data:", error);
    return fetchFn();
  }
}

// Invalidate cache keys by pattern
export async function invalidateCache(pattern: string): Promise<void> {
  try {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } catch (error) {
    console.warn("Cache invalidation failed:", error);
  }
}

// Invalidate user-related caches
export async function invalidateUserCache(userId: number): Promise<void> {
  await invalidateCache(`*:${userId}*`);
}

// Cache middleware for tRPC
export function createCacheMiddleware<T>(
  getCacheKey: (input: T, userId: number) => string,
  ttl: number
) {
  return async (
    input: T,
    userId: number,
    fetchFn: () => Promise<any>
  ): Promise<any> => {
    const key = getCacheKey(input, userId);
    return getOrSetCache(key, ttl, fetchFn);
  };
}
