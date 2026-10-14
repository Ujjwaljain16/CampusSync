// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

const updateSession = vi.fn();

vi.mock('@/lib/supabase/middleware', () => ({
  updateSession: (...a: unknown[]) => updateSession(...a),
}));

import { middleware, config } from '@/middleware';

/** Mirror how Next.js compiles a matcher: anchored, full-path regex. */
function matcherRegex(): RegExp {
  const [matcher] = config.matcher;
  return new RegExp(`^${matcher}$`);
}
const matches = (p: string) => matcherRegex().test(p);

describe('middleware matcher', () => {
  it('matches dynamic page paths that contain a dot', () => {
    expect(matches('/recruiter/student/a.b')).toBe(true);
    expect(matches('/recruiter/student/john.doe@campus.edu')).toBe(true);
    expect(matches('/portfolio/v1.2/page')).toBe(true);
  });

  it('matches ordinary pages', () => {
    expect(matches('/')).toBe(true);
    expect(matches('/login')).toBe(true);
    expect(matches('/dashboard')).toBe(true);
    expect(matches('/student/upload')).toBe(true);
  });

  it('skips static assets and Next internals', () => {
    expect(matches('/logo.png')).toBe(false);
    expect(matches('/images/hero.webp')).toBe(false);
    expect(matches('/_next/static/chunks/x.js')).toBe(false);
    expect(matches('/_next/image')).toBe(false);
    expect(matches('/favicon.ico')).toBe(false);
    expect(matches('/robots.txt')).toBe(false);
    expect(matches('/docs/guide.pdf')).toBe(false);
  });

  it('skips /api/* (each API route self-enforces)', () => {
    expect(matches('/api/x')).toBe(false);
    expect(matches('/api/auth/me')).toBe(false);
  });

  it('matches /.well-known/jwks.json even though it ends in .json', () => {
    expect(matches('/.well-known/jwks.json')).toBe(true);
  });
});

describe('middleware behaviour', () => {
  const saved = { ...process.env };

  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://proj.supabase.test';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon';
    delete process.env.GEMINI_API_KEY;
    updateSession.mockResolvedValue({
      supabaseResponse: new Response('next', { status: 200 }),
      user: null,
      supabase: {},
    });
  });

  afterEach(() => {
    process.env = { ...saved };
  });

  const run = (path: string) => middleware(new NextRequest(new URL(path, 'https://campus.test')));

  it('treats /.well-known/* as public for anonymous visitors', async () => {
    const res = await run('/.well-known/jwks.json');
    expect(res.status).toBe(200);
  });

  it('redirects anonymous visitors from a dotted dynamic page to /login', async () => {
    const res = await run('/recruiter/student/a.b');
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get('location')!).pathname).toBe('/login');
  });

  it('does not take the whole site down when GEMINI_API_KEY is missing', async () => {
    (process.env as Record<string, string>).NODE_ENV = 'production';
    const res = await run('/login');
    expect(res.status).toBe(200);
  });

  it('returns 404 for /test-* and /debug-* pages in production', async () => {
    (process.env as Record<string, string>).NODE_ENV = 'production';
    expect((await run('/test-page')).status).toBe(404);
    expect((await run('/debug-auth')).status).toBe(404);
  });
});
