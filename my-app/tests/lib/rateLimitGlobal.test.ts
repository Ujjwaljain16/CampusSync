// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type RpcArgs = { p_key: string; p_window_seconds: number; p_limit: number };
type RpcResult = { data: unknown; error: { code?: string; message: string } | null };

const rpc = vi.fn<(fn: string, args: RpcArgs) => Promise<RpcResult> | RpcResult>();
const createAdmin = vi.fn();

vi.mock('@/lib/supabaseServer', () => ({
  createSupabaseAdminClient: (...a: unknown[]) => createAdmin(...a),
}));

import {
  BREAKER_FAILURE_THRESHOLD,
  BREAKER_OPEN_MS,
  RPC_TIMEOUT_MS,
  __globalRateLimiterState,
  __resetGlobalRateLimiter,
  enforceGlobalRateLimit,
  globalRateLimitKey,
} from '@/lib/rateLimitGlobal';
import { __resetRateLimitStore } from '@/lib/rateLimit';

const CFG = { limit: 3, windowSeconds: 60 };
const req = (ip = '203.0.113.7') =>
  new Request('http://localhost/api/x', { method: 'POST', headers: { 'x-forwarded-for': ip } });

/**
 * In-memory model of public.rate_limit_hit: one atomic read-modify-write per
 * call on a fixed window (JS is single threaded, so the body below cannot be
 * interleaved, exactly like the row-locked upsert in Postgres).
 */
function installFakeDatabase(now: () => number = Date.now) {
  const counters = new Map<string, number>();
  const keysSeen: string[] = [];
  rpc.mockImplementation(async (_fn, args) => {
    keysSeen.push(args.p_key);
    const windowMs = args.p_window_seconds * 1000;
    const windowStart = Math.floor(now() / windowMs) * windowMs;
    const id = `${args.p_key}|${windowStart}`;
    const count = (counters.get(id) ?? 0) + 1;
    counters.set(id, count);
    return {
      data: [
        {
          allowed: count <= args.p_limit,
          remaining: Math.max(args.p_limit - count, 0),
          reset_at: new Date(windowStart + windowMs).toISOString(),
        },
      ],
      error: null,
    };
  });
  return { counters, keysSeen };
}

beforeEach(() => {
  __resetGlobalRateLimiter();
  __resetRateLimitStore();
  createAdmin.mockImplementation(async () => ({ rpc: (fn: string, args: RpcArgs) => rpc(fn, args) }));
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
});

describe('enforceGlobalRateLimit', () => {
  it('allows up to the limit, then answers 429 with Retry-After and the usual body', async () => {
    installFakeDatabase();
    for (let i = 0; i < CFG.limit; i++) {
      expect(await enforceGlobalRateLimit(req(), 'scope-a', CFG)).toBeNull();
    }
    const res = await enforceGlobalRateLimit(req(), 'scope-a', CFG);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(429);
    expect(await res!.json()).toEqual({ error: 'Too many requests. Please try again later.' });
    const retry = Number(res!.headers.get('Retry-After'));
    expect(retry).toBeGreaterThanOrEqual(1);
    expect(retry).toBeLessThanOrEqual(CFG.windowSeconds);
    expect(res!.headers.get('Content-Type')).toBe('application/json');
  });

  it('calls rate_limit_hit with the window and limit', async () => {
    installFakeDatabase();
    await enforceGlobalRateLimit(req(), 'scope-b', { limit: 7, windowSeconds: 900 });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0][0]).toBe('rate_limit_hit');
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_window_seconds: 900, p_limit: 7 });
  });

  it('keeps separate counters per scope and per client identity', async () => {
    installFakeDatabase();
    for (let i = 0; i < CFG.limit; i++) await enforceGlobalRateLimit(req('198.51.100.1'), 'scope-c', CFG);
    expect(await enforceGlobalRateLimit(req('198.51.100.1'), 'scope-c', CFG)).not.toBeNull();
    expect(await enforceGlobalRateLimit(req('198.51.100.2'), 'scope-c', CFG)).toBeNull();
    expect(await enforceGlobalRateLimit(req('198.51.100.1'), 'scope-d', CFG)).toBeNull();
  });

  it('starts counting again in the next window', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-15T10:00:10Z'));
    installFakeDatabase();
    for (let i = 0; i < CFG.limit; i++) await enforceGlobalRateLimit(req(), 'scope-w', CFG);
    expect(await enforceGlobalRateLimit(req(), 'scope-w', CFG)).not.toBeNull();
    vi.setSystemTime(new Date('2026-10-15T10:01:00Z'));
    expect(await enforceGlobalRateLimit(req(), 'scope-w', CFG)).toBeNull();
  });

  it('Retry-After is the time left in the window', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-15T10:00:45Z'));
    installFakeDatabase();
    for (let i = 0; i < CFG.limit; i++) await enforceGlobalRateLimit(req(), 'scope-r', CFG);
    const res = await enforceGlobalRateLimit(req(), 'scope-r', CFG);
    expect(res!.headers.get('Retry-After')).toBe('15');
  });

  describe('identity', () => {
    it('hashes the client IP: no raw address in the key', async () => {
      const { keysSeen } = installFakeDatabase();
      await enforceGlobalRateLimit(req('203.0.113.99'), 'scope-i', CFG);
      expect(keysSeen).toHaveLength(1);
      expect(keysSeen[0]).not.toContain('203.0.113.99');
      expect(keysSeen[0]).toMatch(/^scope-i:[0-9a-f]{64}$/);
      expect(keysSeen[0]).toBe(globalRateLimitKey('scope-i', '203.0.113.99'));
    });

    it('hashes an explicit identifier (e-mail address, user id)', async () => {
      const { keysSeen } = installFakeDatabase();
      await enforceGlobalRateLimit(req(), 'scope-e', CFG, 'victim@example.test');
      expect(keysSeen[0]).not.toContain('victim');
      expect(keysSeen[0]).not.toContain('example.test');
      expect(keysSeen[0]).toBe(globalRateLimitKey('scope-e', 'victim@example.test'));
    });

    it('uses the same client identity as the in-memory limiter (x-vercel-forwarded-for wins over x-forwarded-for)', async () => {
      const { keysSeen } = installFakeDatabase();
      const r = new Request('http://localhost/x', {
        headers: { 'x-vercel-forwarded-for': '192.0.2.10', 'x-forwarded-for': '6.6.6.6' },
      });
      await enforceGlobalRateLimit(r, 'scope-v', CFG);
      expect(keysSeen[0]).toBe(globalRateLimitKey('scope-v', '192.0.2.10'));
    });

    it('is deterministic and scope separated', () => {
      expect(globalRateLimitKey('a', 'x')).toBe(globalRateLimitKey('a', 'x'));
      expect(globalRateLimitKey('a', 'x')).not.toBe(globalRateLimitKey('b', 'x'));
      expect(globalRateLimitKey('a', 'x')).not.toBe(globalRateLimitKey('a', 'y'));
    });
  });

  describe('concurrency', () => {
    it('N + 5 simultaneous calls let exactly N through', async () => {
      installFakeDatabase();
      const N = 10;
      const results = await Promise.all(
        Array.from({ length: N + 5 }, () => enforceGlobalRateLimit(req(), 'scope-p', { limit: N, windowSeconds: 60 }))
      );
      expect(results.filter((r) => r === null)).toHaveLength(N);
      expect(results.filter((r) => r !== null)).toHaveLength(5);
      expect(rpc).toHaveBeenCalledTimes(N + 5);
    });
  });

  describe('fail open', () => {
    it('lets the request through when the RPC returns an error, and logs a warning', async () => {
      rpc.mockResolvedValue({ data: null, error: { code: 'XX000', message: 'boom' } });
      expect(await enforceGlobalRateLimit(req(), 'scope-f1', CFG)).toBeNull();
      expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('scope-f1'));
      expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('boom'));
    });

    it('lets the request through when the function / table does not exist yet', async () => {
      rpc.mockResolvedValue({
        data: null,
        error: { code: 'PGRST202', message: 'Could not find the function public.rate_limit_hit(p_key, p_limit, p_window_seconds) in the schema cache' },
      });
      for (let i = 0; i < 2; i++) expect(await enforceGlobalRateLimit(req(), 'scope-f2', CFG)).toBeNull();
      rpc.mockResolvedValue({ data: null, error: { code: '42P01', message: 'relation "public.rate_limits" does not exist' } });
      expect(await enforceGlobalRateLimit(req(), 'scope-f2b', CFG)).toBeNull();
    });

    it('never throws: rejected RPC, admin client creation failure and a garbage payload', async () => {
      rpc.mockRejectedValueOnce(new Error('network down'));
      await expect(enforceGlobalRateLimit(req(), 'scope-f3', CFG)).resolves.toBeNull();
      createAdmin.mockRejectedValueOnce(new Error('missing service role key'));
      await expect(enforceGlobalRateLimit(req(), 'scope-f3', CFG)).resolves.toBeNull();
      rpc.mockResolvedValueOnce({ data: 'nonsense', error: null });
      await expect(enforceGlobalRateLimit(req(), 'scope-f3', CFG)).resolves.toBeNull();
    });

    it('falls back to the in-memory limiter for that request', async () => {
      rpc.mockResolvedValue({ data: null, error: { message: 'down' } });
      for (let i = 0; i < CFG.limit; i++) expect(await enforceGlobalRateLimit(req(), 'scope-f4', CFG)).toBeNull();
      const res = await enforceGlobalRateLimit(req(), 'scope-f4', CFG);
      expect(res).not.toBeNull();
      expect(res!.status).toBe(429);
      expect(Number(res!.headers.get('Retry-After'))).toBeGreaterThanOrEqual(1);
    });

    it('does not double count with the route-level in-memory limiter (separate fallback key)', async () => {
      const { enforceRateLimit } = await import('@/lib/rateLimit');
      rpc.mockResolvedValue({ data: null, error: { message: 'down' } });
      // route-level sync check uses the plain scope; the fallback must not share its counter
      for (let i = 0; i < CFG.limit; i++) {
        expect(enforceRateLimit(req(), 'scope-f5', { interval: 60_000, uniqueTokenPerInterval: CFG.limit })).toBeNull();
        expect(await enforceGlobalRateLimit(req(), 'scope-f5', CFG)).toBeNull();
      }
    });

    it('times out a hanging RPC and lets the request through', async () => {
      vi.useFakeTimers();
      rpc.mockImplementation(() => new Promise(() => {}));
      const pending = enforceGlobalRateLimit(req(), 'scope-f6', CFG);
      await vi.advanceTimersByTimeAsync(RPC_TIMEOUT_MS + 1);
      await expect(pending).resolves.toBeNull();
      expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('timed out'));
    });
  });

  describe('circuit breaker', () => {
    it(`opens after ${BREAKER_FAILURE_THRESHOLD} consecutive failures and skips the RPC for ${BREAKER_OPEN_MS / 1000}s`, async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-10-15T10:00:00Z'));
      rpc.mockResolvedValue({ data: null, error: { message: 'down' } });

      for (let i = 0; i < BREAKER_FAILURE_THRESHOLD; i++) await enforceGlobalRateLimit(req(), 'scope-b1', CFG);
      expect(rpc).toHaveBeenCalledTimes(BREAKER_FAILURE_THRESHOLD);
      expect(__globalRateLimiterState().openUntil).toBeGreaterThan(Date.now());

      // open: no RPC and not even an admin client
      createAdmin.mockClear();
      for (let i = 0; i < 5; i++) expect(await enforceGlobalRateLimit(req(), 'scope-b1', { limit: 100, windowSeconds: 60 })).toBeNull();
      expect(rpc).toHaveBeenCalledTimes(BREAKER_FAILURE_THRESHOLD);
      expect(createAdmin).not.toHaveBeenCalled();

      // still open just before the deadline
      vi.setSystemTime(Date.now() + BREAKER_OPEN_MS - 1000);
      await enforceGlobalRateLimit(req(), 'scope-b1', { limit: 100, windowSeconds: 60 });
      expect(rpc).toHaveBeenCalledTimes(BREAKER_FAILURE_THRESHOLD);
    });

    it('does not open on fewer than 3 failures, and a success resets the count', async () => {
      installFakeDatabase();
      rpc.mockResolvedValueOnce({ data: null, error: { message: 'blip' } });
      rpc.mockResolvedValueOnce({ data: null, error: { message: 'blip' } });
      await enforceGlobalRateLimit(req(), 'scope-b2', { limit: 100, windowSeconds: 60 });
      await enforceGlobalRateLimit(req(), 'scope-b2', { limit: 100, windowSeconds: 60 });
      expect(__globalRateLimiterState().failures).toBe(2);
      await enforceGlobalRateLimit(req(), 'scope-b2', { limit: 100, windowSeconds: 60 }); // falls to the default fake: success
      expect(__globalRateLimiterState()).toEqual({ failures: 0, openUntil: 0 });
    });

    it('probes again after the open period and recovers when the database is back', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-10-15T10:00:00Z'));
      rpc.mockResolvedValue({ data: null, error: { message: 'down' } });
      for (let i = 0; i < BREAKER_FAILURE_THRESHOLD; i++) await enforceGlobalRateLimit(req(), 'scope-b3', CFG);
      expect(rpc).toHaveBeenCalledTimes(3);

      vi.setSystemTime(Date.now() + BREAKER_OPEN_MS + 1);
      installFakeDatabase();
      expect(await enforceGlobalRateLimit(req(), 'scope-b3', CFG)).toBeNull();
      expect(rpc).toHaveBeenCalledTimes(4);
      expect(__globalRateLimiterState()).toEqual({ failures: 0, openUntil: 0 });

      // fully recovered: enforcement is global again
      for (let i = 0; i < CFG.limit; i++) await enforceGlobalRateLimit(req('198.51.100.50'), 'scope-b3', CFG);
      expect(await enforceGlobalRateLimit(req('198.51.100.50'), 'scope-b3', CFG)).not.toBeNull();
    });

    it('a failed probe re-opens the breaker straight away', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-10-15T10:00:00Z'));
      rpc.mockResolvedValue({ data: null, error: { message: 'down' } });
      for (let i = 0; i < BREAKER_FAILURE_THRESHOLD; i++) await enforceGlobalRateLimit(req(), 'scope-b4', CFG);
      vi.setSystemTime(Date.now() + BREAKER_OPEN_MS + 1);
      await enforceGlobalRateLimit(req(), 'scope-b4', CFG); // probe fails
      expect(rpc).toHaveBeenCalledTimes(4);
      await enforceGlobalRateLimit(req(), 'scope-b4', CFG);
      expect(rpc).toHaveBeenCalledTimes(4); // skipped again
    });
  });
});
