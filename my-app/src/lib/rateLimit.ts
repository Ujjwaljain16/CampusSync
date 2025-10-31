/**
 * Rate Limiting Middleware for API Routes
 * Prevents abuse and ensures fair usage
 */

interface RateLimitStore {
  count: number;
  resetTime: number;
}

const rateLimitStore = new Map<string, RateLimitStore>();

// Cleanup old entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of rateLimitStore.entries()) {
    if (value.resetTime < now) {
      rateLimitStore.delete(key);
    }
  }
}, 5 * 60 * 1000);

export interface RateLimitConfig {
  interval: number; // Time window in milliseconds
  uniqueTokenPerInterval: number; // Max requests per window
}

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
}

/**
 * Rate limit checker
 * @param identifier - Unique identifier (user ID, IP, etc.)
 * @param config - Rate limit configuration
 * @returns Rate limit result with success status
 */
export function rateLimit(
  identifier: string,
  config: RateLimitConfig = {
    interval: 60 * 1000, // 1 minute
    uniqueTokenPerInterval: 10, // 10 requests per minute
  }
): RateLimitResult {
  const now = Date.now();
  const resetTime = now + config.interval;

  const tokenData = rateLimitStore.get(identifier);

  if (!tokenData) {
    // First request
    rateLimitStore.set(identifier, {
      count: 1,
      resetTime,
    });

    return {
      success: true,
      limit: config.uniqueTokenPerInterval,
      remaining: config.uniqueTokenPerInterval - 1,
      reset: resetTime,
    };
  }

  if (tokenData.resetTime < now) {
    // Window expired, reset
    rateLimitStore.set(identifier, {
      count: 1,
      resetTime,
    });

    return {
      success: true,
      limit: config.uniqueTokenPerInterval,
      remaining: config.uniqueTokenPerInterval - 1,
      reset: resetTime,
    };
  }

  // Within window
  tokenData.count++;

  if (tokenData.count > config.uniqueTokenPerInterval) {
    // Rate limit exceeded
    return {
      success: false,
      limit: config.uniqueTokenPerInterval,
      remaining: 0,
      reset: tokenData.resetTime,
    };
  }

  return {
    success: true,
    limit: config.uniqueTokenPerInterval,
    remaining: config.uniqueTokenPerInterval - tokenData.count,
    reset: tokenData.resetTime,
  };
}

/**
 * Rate limit middleware for API routes
 * Usage: const limiter = await rateLimitMiddleware(userId);
 *        if (!limiter.success) return NextResponse.json(...)
 */
export async function rateLimitMiddleware(
  identifier: string,
  config?: RateLimitConfig
): Promise<RateLimitResult> {
  return rateLimit(identifier, config);
}

/**
 * Preset rate limit configurations
 */
export const RateLimitPresets = {
  // Strict: 5 requests per minute
  strict: {
    interval: 60 * 1000,
    uniqueTokenPerInterval: 5,
  },
  // Standard: 10 requests per minute
  standard: {
    interval: 60 * 1000,
    uniqueTokenPerInterval: 10,
  },
  // Relaxed: 30 requests per minute
  relaxed: {
    interval: 60 * 1000,
    uniqueTokenPerInterval: 30,
  },
  // Upload: 3 requests per 5 minutes (for file uploads)
  upload: {
    interval: 5 * 60 * 1000,
    uniqueTokenPerInterval: 3,
  },
  // Search: 20 requests per minute
  search: {
    interval: 60 * 1000,
    uniqueTokenPerInterval: 20,
  },
  // Auth: 5 attempts per 15 minutes
  auth: {
    interval: 15 * 60 * 1000,
    uniqueTokenPerInterval: 5,
  },
};
