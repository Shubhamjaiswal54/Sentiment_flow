// Simple in-memory cache implementation
const cache: Record<string, {
  data: any;
  expiry: number;
}> = {};

/**
 * Get data from cache
 */
export function getCache(key: string): any | null {
  const item = cache[key];
  
  if (!item) return null;
  
  // Check if expired
  if (Date.now() > item.expiry) {
    delete cache[key];
    return null;
  }
  
  return item.data;
}

/**
 * Set data in cache with expiry in seconds
 */
export function setCache(key: string, data: any, ttlSeconds: number): void {
  cache[key] = {
    data,
    expiry: Date.now() + ttlSeconds * 1000
  };
}

/**
 * Clear all cache
 */
export function clearCache(): void {
  Object.keys(cache).forEach(key => delete cache[key]);
}

/**
 * Clear cache key pattern
 */
export function clearCachePattern(pattern: string): void {
  Object.keys(cache).forEach(key => {
    if (key.includes(pattern)) {
      delete cache[key];
    }
  });
}