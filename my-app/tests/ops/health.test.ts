// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

type PingResult = { error: unknown };
let pingImpl: () => Promise<PingResult> | PingResult = () => ({ error: null });

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        limit: () => ({
          abortSignal: () => pingImpl(),
        }),
      }),
    }),
  }),
}));

const ENV_KEYS = [
  'NODE_ENV',
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'GEMINI_API_KEY',
  'VC_ISSUER_JWK',
  'NEXT_PUBLIC_SITE_URL',
] as const;

const saved: Record<string, string | undefined> = {};

function setEnv(env: Record<string, string | undefined>) {
  for (const k of ENV_KEYS) {
    if (env[k] === undefined) delete (process.env as Record<string, string | undefined>)[k];
    else (process.env as Record<string, string | undefined>)[k] = env[k];
  }
}

const GOOD_ENV = {
  NODE_ENV: 'production',
  NEXT_PUBLIC_SUPABASE_URL: 'https://proj.supabase.test',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon',
  GEMINI_API_KEY: 'g',
  VC_ISSUER_JWK: JSON.stringify({ kty: 'EC', alg: 'ES256' }),
  NEXT_PUBLIC_SITE_URL: 'https://campus.test',
};

describe('GET /api/health', () => {
  beforeEach(() => {
    for (const k of ENV_KEYS) saved[k] = process.env[k];
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'debug').mockImplementation(() => {});
    pingImpl = () => ({ error: null });
  });

  afterEach(() => {
    vi.useRealTimers();
    setEnv(saved as Record<string, string | undefined>);
  });

  async function get() {
    const { GET } = await import('@/app/api/health/route');
    return GET();
  }

  it('returns 200 ok when the database responds and config is complete', async () => {
    setEnv(GOOD_ENV);
    const res = await get();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.healthy).toBe(true);
    expect(body.status).toBe('ok');
  });

  it('returns 503 and no error text when the database query fails', async () => {
    setEnv(GOOD_ENV);
    pingImpl = () => ({ error: { message: 'connection refused to db.internal:5432', code: '08006' } });
    const res = await get();
    const text = await res.text();
    expect(res.status).toBe(503);
    expect(JSON.parse(text).healthy).toBe(false);
    expect(text).not.toContain('db.internal');
    expect(text).not.toContain('connection refused');
  });

  it('returns 503 when the database ping throws', async () => {
    setEnv(GOOD_ENV);
    pingImpl = () => {
      throw new Error('socket hang up');
    };
    const res = await get();
    expect(res.status).toBe(503);
    expect(await res.text()).not.toContain('socket hang up');
  });

  it('returns 503 when the database ping times out (2s)', async () => {
    setEnv(GOOD_ENV);
    vi.useFakeTimers();
    pingImpl = () => new Promise(() => {});
    const pending = get();
    await vi.advanceTimersByTimeAsync(2500);
    const res = await pending;
    expect(res.status).toBe(503);
  });

  it('is degraded (HTTP 200) when GEMINI_API_KEY or the VC key is missing', async () => {
    setEnv({ ...GOOD_ENV, GEMINI_API_KEY: undefined, VC_ISSUER_JWK: undefined });
    const res = await get();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.healthy).toBe(true);
    expect(body.status).toBe('degraded');
  });

  it('is unhealthy (503) when Supabase is not configured, without pinging', async () => {
    setEnv({ ...GOOD_ENV, NEXT_PUBLIC_SUPABASE_URL: undefined, NEXT_PUBLIC_SUPABASE_ANON_KEY: undefined });
    const res = await get();
    expect(res.status).toBe(503);
  });

  it('does not expose configuration details in production', async () => {
    setEnv(GOOD_ENV);
    const body = await (await get()).json();
    expect(Object.keys(body).sort()).toEqual(['healthy', 'status', 'timestamp']);
  });
});

describe('GET /api/ping-supabase', () => {
  beforeEach(() => {
    for (const k of ENV_KEYS) saved[k] = process.env[k];
    vi.spyOn(console, 'error').mockImplementation(() => {});
    setEnv(GOOD_ENV);
  });
  afterEach(() => setEnv(saved as Record<string, string | undefined>));

  // ping-supabase queries without an abort signal, so it needs its own chain
  it('returns 503 with a generic body on query error', async () => {
    vi.resetModules();
    vi.doMock('@supabase/supabase-js', () => ({
      createClient: () => ({
        from: () => ({ select: () => ({ limit: async () => ({ error: { message: 'secret detail', code: 'XX' } }) }) }),
      }),
    }));
    const { GET } = await import('@/app/api/ping-supabase/route');
    const res = await GET();
    const text = await res.text();
    expect(res.status).toBe(503);
    expect(JSON.parse(text).success).toBe(false);
    expect(text).not.toContain('secret detail');
    vi.doUnmock('@supabase/supabase-js');
  });

  it('returns 503 (not 200) on exceptions, without error text', async () => {
    vi.resetModules();
    vi.doMock('@supabase/supabase-js', () => ({
      createClient: () => {
        throw new Error('kaboom internals');
      },
    }));
    const { GET } = await import('@/app/api/ping-supabase/route');
    const res = await GET();
    expect(res.status).toBe(503);
    expect(await res.text()).not.toContain('kaboom');
    vi.doUnmock('@supabase/supabase-js');
  });

  it('returns 200 only on a successful query', async () => {
    vi.resetModules();
    vi.doMock('@supabase/supabase-js', () => ({
      createClient: () => ({ from: () => ({ select: () => ({ limit: async () => ({ error: null }) }) }) }),
    }));
    const { GET } = await import('@/app/api/ping-supabase/route');
    const res = await GET();
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
    vi.doUnmock('@supabase/supabase-js');
  });
});
