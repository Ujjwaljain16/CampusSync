/**
 * Advanced Caching System
 * Improves performance by caching API responses and computed values
 */

export interface CacheEntry<T> {
  value: T;
  expiry: number;
  key: string;
}

export interface CacheConfig {
  ttl?: number; // Time to live in milliseconds
  maxSize?: number; // Maximum cache size
}

class CacheManager {
  private static instance: CacheManager;
  private cache: Map<string, CacheEntry<unknown>> = new Map();
  private defaultTTL = 5 * 60 * 1000; // 5 minutes
  private maxSize = 1000;

  private constructor() {
    // Cleanup expired entries every minute
    setInterval(() => this.cleanup(), 60 * 1000);
  }

  static getInstance(): CacheManager {
    if (!CacheManager.instance) {
      CacheManager.instance = new CacheManager();
    }
    return CacheManager.instance;
  }

  /**
   * Get value from cache
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key) as CacheEntry<T> | undefined;

    if (!entry) {
      return null;
    }

    // Check if expired
    if (Date.now() > entry.expiry) {
      this.cache.delete(key);
      return null;
    }

    return entry.value;
  }

  /**
   * Set value in cache
   */
  set<T>(key: string, value: T, ttl?: number): void {
    // Check cache size limit
    if (this.cache.size >= this.maxSize) {
      // Remove oldest entry
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }

    const expiry = Date.now() + (ttl || this.defaultTTL);

    this.cache.set(key, {
      value,
      expiry,
      key,
    });
  }

  /**
   * Delete value from cache
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Clear all cache
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Check if key exists and is valid
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    // Check if expired
    if (Date.now() > entry.expiry) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    size: number;
    maxSize: number;
    keys: string[];
  } {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      keys: Array.from(this.cache.keys()),
    };
  }

  /**
   * Cleanup expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiry) {
        expiredKeys.push(key);
      }
    }

    expiredKeys.forEach((key) => this.cache.delete(key));
  }

  /**
   * Get or set pattern (fetch if not in cache)
   */
  async getOrSet<T>(
    key: string,
    fetchFn: () => Promise<T>,
    ttl?: number
  ): Promise<T> {
    // Try to get from cache
    const cached = this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    // Fetch and cache
    const value = await fetchFn();
    this.set(key, value, ttl);
    return value;
  }
}

// Export singleton instance
export const cache = CacheManager.getInstance();

/**
 * Cache presets for different types of data
 */
export const CachePresets = {
  // Very short TTL: 1 minute
  veryShort: 1 * 60 * 1000,
  // Short TTL: 5 minutes
  short: 5 * 60 * 1000,
  // Medium TTL: 15 minutes
  medium: 15 * 60 * 1000,
  // Long TTL: 1 hour
  long: 60 * 60 * 1000,
  // Very long TTL: 24 hours
  veryLong: 24 * 60 * 60 * 1000,
  // User profile: 15 minutes
  userProfile: 15 * 60 * 1000,
  // Search results: 5 minutes
  searchResults: 5 * 60 * 1000,
  // Analytics: 1 hour
  analytics: 60 * 60 * 1000,
  // Static data: 24 hours
  staticData: 24 * 60 * 60 * 1000,
};

/**
 * Memoization decorator for functions
 */
export function memoize<T extends (...args: unknown[]) => unknown>(
  fn: T,
  options: { ttl?: number; keyFn?: (...args: Parameters<T>) => string } = {}
): T {
  const { ttl, keyFn } = options;

  return ((...args: Parameters<T>) => {
    const key = keyFn
      ? keyFn(...args)
      : `memoize:${fn.name}:${JSON.stringify(args)}`;

    const cached = cache.get(key);
    if (cached !== null) {
      return cached;
    }

    const result = fn(...args);

    if (result instanceof Promise) {
      return result.then((value) => {
        cache.set(key, value, ttl);
        return value;
      });
    }

    cache.set(key, result, ttl);
    return result;
  }) as T;
}

/**
 * Cache key generators
 */
export const CacheKeys = {
  user: (userId: string) => `user:${userId}`,
  userRole: (userId: string) => `user:role:${userId}`,
  certificate: (certId: string) => `certificate:${certId}`,
  certificates: (userId: string, status?: string) =>
    `certificates:${userId}:${status || 'all'}`,
  searchResults: (query: string, filters: Record<string, unknown>) =>
    `search:${query}:${JSON.stringify(filters)}`,
  analytics: (type: string, timeRange: string) =>
    `analytics:${type}:${timeRange}`,
  trustedIssuers: () => 'trusted-issuers',
};
