import { describe, it, expect, beforeEach } from 'vitest';
import {
  rateLimit,
  getClientIp,
  enforceRateLimit,
  RATE_LIMIT_MAX_KEYS,
  __rateLimitStoreSize,
  __resetRateLimitStore,
} from '@/lib/rateLimit';

const cfg = { interval: 60_000, uniqueTokenPerInterval: 2 };

describe('rateLimit', () => {
  beforeEach(() => __resetRateLimitStore());

  it('limits after the configured number of requests', () => {
    expect(rateLimit('k', cfg).success).toBe(true);
    expect(rateLimit('k', cfg).success).toBe(true);
    expect(rateLimit('k', cfg).success).toBe(false);
  });

  it('bounds the number of tracked keys and evicts the oldest first', () => {
    for (let i = 0; i < RATE_LIMIT_MAX_KEYS + 500; i++) {
      rateLimit(`key-${i}`, cfg);
    }
    expect(__rateLimitStoreSize()).toBeLessThanOrEqual(RATE_LIMIT_MAX_KEYS);

    // the oldest keys were evicted (their counters start over) ...
    expect(rateLimit('key-0', cfg).remaining).toBe(1); // fresh entry (count 1 of 2)
    // ... while recent ones are still tracked
    const last = `key-${RATE_LIMIT_MAX_KEYS + 499}`;
    expect(rateLimit(last, cfg).remaining).toBe(0); // still tracked: second hit of 2
  });

  it('enforceRateLimit returns a 429 with Retry-After once exceeded', () => {
    const req = new Request('http://x.test', { headers: { 'x-real-ip': '198.51.100.1' } });
    expect(enforceRateLimit(req, 's', cfg)).toBeNull();
    expect(enforceRateLimit(req, 's', cfg)).toBeNull();
    const res = enforceRateLimit(req, 's', cfg);
    expect(res?.status).toBe(429);
    expect(Number(res?.headers.get('Retry-After'))).toBeGreaterThan(0);
  });
});

describe('getClientIp', () => {
  const req = (headers: Record<string, string>) => new Request('http://x.test', { headers });

  it('prefers platform-set headers over a client-controlled X-Forwarded-For', () => {
    expect(
      getClientIp(req({ 'x-vercel-forwarded-for': '203.0.113.5', 'x-real-ip': '203.0.113.6', 'x-forwarded-for': '1.2.3.4' }))
    ).toBe('203.0.113.5');
    expect(getClientIp(req({ 'x-real-ip': '203.0.113.6', 'x-forwarded-for': '1.2.3.4' }))).toBe('203.0.113.6');
  });

  it('falls back to the first X-Forwarded-For entry, then "unknown"', () => {
    expect(getClientIp(req({ 'x-forwarded-for': '1.2.3.4, 10.0.0.1' }))).toBe('1.2.3.4');
    expect(getClientIp(req({}))).toBe('unknown');
  });
});
