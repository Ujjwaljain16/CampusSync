// @vitest-environment node
/**
 * POST /api/auth/login with the REAL @supabase/ssr + supabase-js running against a fake auth server
 * (global fetch is stubbed), so the cookie attributes asserted here are the ones the library really emits.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import {
  cookieJar,
  calls,
  json,
  fakeSession,
  ACCESS_TOKEN,
  fakeUser,
  installFetchStub,
  setEnv,
  type Handler,
} from '../helpers/gotrueStub';
import { __resetRateLimitStore } from '@/lib/rateLimit';

vi.mock('next/headers', () => ({ cookies: async () => cookieJar.store }));

import { POST } from '@/app/api/auth/login/route';

const USER_ID = '00000000-0000-4000-8000-000000000001';
const ORG = '00000000-0000-4000-8000-0000000000aa';

let nextIp = 0;
function loginReq(body: unknown, ip = `10.0.0.${++nextIp}`): NextRequest {
  return new NextRequest('http://localhost/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-real-ip': ip },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

const okToken: Handler = () => json(fakeSession(fakeUser(USER_ID, 'u@campus.test')));
const rolesHandler = (rows: unknown[] | 'error'): Handler => () =>
  rows === 'error' ? json({ message: 'boom' }, 500) : json(rows);

function stub(opts: { token?: Handler; roles?: unknown[] | 'error' } = {}) {
  installFetchStub({
    'POST /auth/v1/token': opts.token ?? okToken,
    'GET /rest/v1/user_roles': rolesHandler(opts.roles ?? []),
  });
}

beforeEach(() => {
  setEnv();
  cookieJar.reset();
  __resetRateLimitStore();
  nextIp = 0;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

/** Replays the cookies the route set into a real response and returns its Set-Cookie headers. */
function setCookieHeaders(): string[] {
  const res = NextResponse.json({});
  cookieJar.sets.forEach((c) => res.cookies.set(c.name, c.value, c.options));
  return res.headers.getSetCookie();
}

describe('POST /api/auth/login: session cookies', () => {
  it('sets every sb-* session cookie HttpOnly, Secure, SameSite=Lax and Path=/', async () => {
    stub({ roles: [{ role: 'student', organization_id: ORG, approval_status: 'approved', created_at: '2026-01-01' }] });
    const res = await POST(loginReq({ email: 'u@campus.test', password: 'correct horse' }));
    expect(res.status).toBe(200);

    const headers = setCookieHeaders().filter((h) => h.startsWith('sb-'));
    expect(headers.length).toBeGreaterThan(0);
    for (const h of headers) {
      expect(h).toMatch(/;\s*HttpOnly/i);
      expect(h).toMatch(/;\s*Secure/i);
      expect(h).toMatch(/;\s*SameSite=lax/i);
      expect(h).toMatch(/;\s*Path=\//i);
      expect(h).toMatch(/;\s*Max-Age=\d{6,}/i); // the library's own (long) lifetime is kept
    }
  });

  it('does not set Secure under `next dev` (plain http) but stays HttpOnly', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    stub();
    await POST(loginReq({ email: 'u@campus.test', password: 'pw' }));
    const headers = setCookieHeaders().filter((h) => h.startsWith('sb-'));
    expect(headers.length).toBeGreaterThan(0);
    for (const h of headers) {
      expect(h).toMatch(/;\s*HttpOnly/i);
      expect(h).not.toMatch(/;\s*Secure/i);
    }
  });

  it('never returns the tokens in the response body', async () => {
    stub();
    const res = await POST(loginReq({ email: 'u@campus.test', password: 'pw' }));
    const text = await res.text();
    expect(text).not.toContain(ACCESS_TOKEN);
    expect(text).not.toContain('refresh-token-value');
    expect(res.headers.get('cache-control')).toBe('no-store');
  });
});

describe('POST /api/auth/login: success payload', () => {
  const cases: Array<[string, unknown[], string, string]> = [
    ['student', [{ role: 'student', organization_id: ORG, approval_status: 'approved', created_at: '2026-01-01' }], 'student', '/student/dashboard'],
    ['faculty', [{ role: 'faculty', organization_id: ORG, approval_status: 'approved', created_at: '2026-01-01' }], 'faculty', '/faculty/dashboard'],
    ['recruiter', [{ role: 'recruiter', organization_id: null, approval_status: 'approved', created_at: '2026-01-01' }], 'recruiter', '/recruiter/dashboard'],
    ['org admin', [{ role: 'org_admin', organization_id: ORG, approval_status: 'approved', created_at: '2026-01-01' }], 'org_admin', '/dashboard'],
    ['pending recruiter', [{ role: 'recruiter', organization_id: null, approval_status: 'pending', created_at: '2026-01-01' }], 'recruiter', '/recruiter/waiting'],
    ['denied recruiter', [{ role: 'recruiter', organization_id: null, approval_status: 'denied', created_at: '2026-01-01' }], 'recruiter', '/recruiter/waiting'],
    ['pending faculty', [{ role: 'faculty', organization_id: ORG, approval_status: 'pending', created_at: '2026-01-01' }], 'faculty', '/faculty/waiting'],
  ];

  it.each(cases)('%s', async (_name, rows, role, redirectTo) => {
    stub({ roles: rows });
    const res = await POST(loginReq({ email: 'u@campus.test', password: 'pw' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, role, redirectTo });
    expect(body).toHaveProperty('organization_id');
    expect(body).toHaveProperty('approval_status');
  });

  it('with several role rows, the highest approved one decides (a pending recruiter row does not hide an approved student)', async () => {
    stub({
      roles: [
        { role: 'student', organization_id: ORG, approval_status: 'approved', created_at: '2026-01-01' },
        { role: 'recruiter', organization_id: null, approval_status: 'pending', created_at: '2026-01-02' },
      ],
    });
    const body = await (await POST(loginReq({ email: 'u@campus.test', password: 'pw' }))).json();
    expect(body).toMatchObject({ role: 'student', organization_id: ORG, approval_status: 'approved', redirectTo: '/student/dashboard' });
  });

  it('a user with no role rows still signs in and lands on /dashboard', async () => {
    stub({ roles: [] });
    const body = await (await POST(loginReq({ email: 'u@campus.test', password: 'pw' }))).json();
    expect(body).toMatchObject({ ok: true, role: null, redirectTo: '/dashboard' });
  });

  it('a failing role lookup does not block the login', async () => {
    stub({ roles: 'error' });
    const res = await POST(loginReq({ email: 'u@campus.test', password: 'pw' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, redirectTo: '/dashboard' });
    expect(cookieJar.sets.length).toBeGreaterThan(0);
  });

  it('passes the trimmed email and the password to the auth server', async () => {
    stub();
    await POST(loginReq({ email: '  u@campus.test ', password: ' p w ' }));
    const tokenCall = calls.find((c) => c.path === '/auth/v1/token');
    expect(tokenCall?.body).toMatchObject({ email: 'u@campus.test', password: ' p w ' });
  });
});

describe('POST /api/auth/login: failures', () => {
  const invalid: Handler = () => json({ code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' }, 400);

  it('answers 401 with one generic message and sets no cookie', async () => {
    stub({ token: invalid });
    const res = await POST(loginReq({ email: 'u@campus.test', password: 'wrong' }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Invalid email or password' });
    expect(cookieJar.sets).toHaveLength(0);
  });

  it('gives an unknown account exactly the same answer as a wrong password', async () => {
    stub({ token: invalid });
    const wrongPassword = await POST(loginReq({ email: 'exists@campus.test', password: 'wrong' }));
    const noSuchUser = await POST(loginReq({ email: 'nobody@campus.test', password: 'wrong' }));
    expect(noSuchUser.status).toBe(wrongPassword.status);
    expect(await noSuchUser.text()).toBe(await wrongPassword.text());
  });

  it('does not echo the auth server message', async () => {
    stub({ token: () => json({ code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials for u@campus.test' }, 400) });
    const text = await (await POST(loginReq({ email: 'u@campus.test', password: 'wrong' }))).text();
    expect(text).not.toMatch(/Invalid login credentials/);
  });

  it('reports an unconfirmed email distinctly (only reachable after the right password)', async () => {
    stub({ token: () => json({ code: 400, error_code: 'email_not_confirmed', msg: 'Email not confirmed' }, 400) });
    const res = await POST(loginReq({ email: 'u@campus.test', password: 'right' }));
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: 'email_not_confirmed' });
    expect(cookieJar.sets).toHaveLength(0);
  });

  it('reports an auth service outage as 503, not as bad credentials', async () => {
    stub({ token: () => json({ msg: 'down' }, 502) });
    expect((await POST(loginReq({ email: 'u@campus.test', password: 'pw' }))).status).toBe(503);
  });

  it('reports a network failure as 503', async () => {
    stub({
      token: () => {
        throw new TypeError('fetch failed');
      },
    });
    expect((await POST(loginReq({ email: 'u@campus.test', password: 'pw' }))).status).toBe(503);
  });

  it.each([
    ['empty body', {}],
    ['missing password', { email: 'u@campus.test' }],
    ['missing email', { password: 'pw' }],
    ['not an email', { email: 'nope', password: 'pw' }],
    ['non-string password', { email: 'u@campus.test', password: 12345 }],
    ['oversized password', { email: 'u@campus.test', password: 'x'.repeat(2000) }],
    ['oversized email', { email: `${'a'.repeat(300)}@campus.test`, password: 'pw' }],
  ])('rejects %s with 400 without calling the auth server', async (_n, body) => {
    stub();
    const res = await POST(loginReq(body));
    expect(res.status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it('rejects a non-JSON body with 400', async () => {
    stub();
    expect((await POST(loginReq('not json'))).status).toBe(400);
  });
});

describe('POST /api/auth/login: rate limiting', () => {
  it('limits attempts per account (11th within the window is 429 with Retry-After), even from different addresses', async () => {
    stub({ token: () => json({ error_code: 'invalid_credentials', msg: 'x' }, 400) });
    for (let i = 0; i < 10; i++) {
      const res = await POST(loginReq({ email: 'victim@campus.test', password: 'guess' }));
      expect(res.status).toBe(401);
    }
    const limited = await POST(loginReq({ email: 'Victim@Campus.test', password: 'guess' }));
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0);
  });

  it('limits attempts per client address across accounts, before reading the body', async () => {
    stub({ token: () => json({ error_code: 'invalid_credentials', msg: 'x' }, 400) });
    for (let i = 0; i < 30; i++) {
      const res = await POST(loginReq({ email: `user${i}@campus.test`, password: 'guess' }, '203.0.113.9'));
      expect(res.status).toBe(401);
    }
    const before = calls.length;
    const limited = await POST(loginReq({ email: 'another@campus.test', password: 'guess' }, '203.0.113.9'));
    expect(limited.status).toBe(429);
    expect(calls.length).toBe(before);
  });

  it('another client address and account are unaffected', async () => {
    stub();
    for (let i = 0; i < 11; i++) await POST(loginReq({ email: 'victim@campus.test', password: 'x' }));
    const res = await POST(loginReq({ email: 'someone.else@campus.test', password: 'pw' }, '198.51.100.7'));
    expect(res.status).toBe(200);
  });
});
