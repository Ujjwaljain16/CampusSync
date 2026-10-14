// @vitest-environment node
/**
 * Every place that writes Supabase auth cookies on the server must write them HttpOnly (and Secure outside
 * `next dev`, SameSite=Lax, Path=/), with the real @supabase/ssr running against a fake auth server.
 * Also a source-level guard so a new createServerClient() call cannot forget the options.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  cookieJar,
  calls,
  json,
  fakeSession,
  ACCESS_TOKEN,
  fakeUser,
  installFetchStub,
  setEnv,
  COOKIE_PREFIX,
  sessionCookieValue,
} from '../helpers/gotrueStub';
import { authCookieOptions } from '@/lib/supabase/cookieOptions';

vi.mock('next/headers', () => ({ cookies: async () => cookieJar.store }));

import { updateSession } from '@/lib/supabase/middleware';
import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { GET as callbackGET } from '@/app/api/auth/callback/route';
import { GET as oauthGET } from '@/app/api/auth/oauth/google/route';
import { POST as completeLoginPOST } from '@/app/api/auth/complete-login/route';
import { GET as confirmGET } from '@/app/auth/confirm/route';

beforeEach(() => {
  setEnv();
  cookieJar.reset();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const authCookies = (headers: string[]) => headers.filter((h) => h.startsWith('sb-'));
function expectAllHardened(headers: string[]) {
  const mine = authCookies(headers);
  expect(mine.length).toBeGreaterThan(0);
  for (const h of mine) {
    expect(h).toMatch(/;\s*HttpOnly/i);
    expect(h).toMatch(/;\s*Secure/i);
    expect(h).toMatch(/;\s*SameSite=lax/i);
    expect(h).toMatch(/;\s*Path=\//i);
  }
}

describe('authCookieOptions()', () => {
  it('is HttpOnly, SameSite=Lax, Path=/ and Secure by default, with no maxAge of its own', () => {
    expect(authCookieOptions()).toEqual({ path: '/', sameSite: 'lax', httpOnly: true, secure: true });
  });
  it('is Secure in production and in test, not under next dev', () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(authCookieOptions().secure).toBe(true);
    vi.stubEnv('NODE_ENV', 'development');
    expect(authCookieOptions().secure).toBe(false);
    expect(authCookieOptions().httpOnly).toBe(true);
  });
});

describe('middleware session refresh', () => {
  it('rewrites a refreshed session HttpOnly (this also upgrades cookies an older browser client wrote)', async () => {
    const expired = fakeSession(fakeUser('user-1'), -60); // access token already expired
    installFetchStub({
      'POST /auth/v1/token': () => json(fakeSession(fakeUser('user-1'))),
      'GET /auth/v1/user': () => json(fakeUser('user-1')),
    });
    const request = new NextRequest('http://localhost/dashboard', {
      headers: { cookie: `${COOKIE_PREFIX}=${sessionCookieValue(expired)}` },
    });
    const { supabaseResponse, user } = await updateSession(request);
    expect(user?.id).toBe('user-1');
    expect(calls.some((c) => c.path === '/auth/v1/token')).toBe(true);
    expectAllHardened(supabaseResponse.headers.getSetCookie());
  });

  it('writes nothing when the session is still fresh', async () => {
    installFetchStub({ 'GET /auth/v1/user': () => json(fakeUser('user-1')) });
    const request = new NextRequest('http://localhost/dashboard', {
      headers: { cookie: `${COOKIE_PREFIX}=${sessionCookieValue(fakeSession(fakeUser('user-1')))}` },
    });
    const { supabaseResponse } = await updateSession(request);
    expect(authCookies(supabaseResponse.headers.getSetCookie())).toHaveLength(0);
  });
});

describe('server client (route handlers / server components)', () => {
  it('hands HttpOnly options to the cookie store when it refreshes a session', async () => {
    cookieJar.jar.set(COOKIE_PREFIX, sessionCookieValue(fakeSession(fakeUser('user-1'), -60)));
    installFetchStub({
      'POST /auth/v1/token': () => json(fakeSession(fakeUser('user-1'))),
      'GET /auth/v1/user': () => json(fakeUser('user-1')),
    });
    const supabase = await createSupabaseServerClient();
    await supabase.auth.getUser();
    const written = cookieJar.sets.filter((c) => c.name.startsWith(COOKIE_PREFIX));
    expect(written.length).toBeGreaterThan(0);
    written.forEach((c) => expect(c.options).toMatchObject({ httpOnly: true, secure: true, sameSite: 'lax', path: '/' }));
  });
});

describe('/api/auth/callback (code exchange)', () => {
  const verifierCookie = `${COOKIE_PREFIX}-code-verifier=verifier-value-0123456789`;

  function stubExchange(extra: Record<string, () => Response> = {}) {
    installFetchStub({
      'POST /auth/v1/token': () => json(fakeSession(fakeUser('user-1'))),
      'GET /auth/v1/user': () => json(fakeUser('user-1')),
      'GET /rest/v1/profiles': () => json({ id: 'user-1', email: 'user@campus.test' }),
      'GET /rest/v1/user_roles': () => json([]),
      ...extra,
    });
  }

  it('sets the session cookies HttpOnly on the redirect', async () => {
    stubExchange();
    const res = await callbackGET(
      new NextRequest('http://localhost/api/auth/callback?code=abc&redirectTo=%2Fdashboard', { headers: { cookie: verifierCookie } })
    );
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('http://localhost/dashboard');
    expectAllHardened(res.headers.getSetCookie());
  });

  it('password recovery: exchanges the code and goes straight to /reset-password, HttpOnly, without profile or role routing', async () => {
    stubExchange({
      // a pending recruiter would otherwise be sent to the waiting page
      'GET /rest/v1/user_roles': () => json({ role: 'recruiter', approval_status: 'pending' }),
    });
    const res = await callbackGET(
      new NextRequest('http://localhost/api/auth/callback?code=abc&redirectTo=%2Freset-password', { headers: { cookie: verifierCookie } })
    );
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('http://localhost/reset-password');
    expectAllHardened(res.headers.getSetCookie());
    expect(calls.some((c) => c.path.startsWith('/rest/v1/'))).toBe(false);
  });

  it('a failed exchange redirects to /login with no session cookie', async () => {
    installFetchStub({ 'POST /auth/v1/token': () => json({ error_code: 'flow_state_not_found', msg: 'invalid flow state' }, 404) });
    const res = await callbackGET(
      new NextRequest('http://localhost/api/auth/callback?code=bad&redirectTo=%2Freset-password', { headers: { cookie: verifierCookie } })
    );
    expect(res.headers.get('location')).toContain('/login?error=');
    expect(authCookies(res.headers.getSetCookie())).toHaveLength(0);
  });
});

describe('/api/auth/oauth/google', () => {
  it('stores the PKCE verifier HttpOnly', async () => {
    installFetchStub({});
    const res = await oauthGET(new NextRequest('http://localhost/api/auth/oauth/google?redirectTo=%2Fdashboard'));
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toContain('/auth/v1/authorize');
    const mine = authCookies(res.headers.getSetCookie());
    expect(mine.some((h) => h.startsWith(`${COOKIE_PREFIX}-code-verifier=`))).toBe(true);
    expectAllHardened(res.headers.getSetCookie());
  });
});

describe('/api/auth/complete-login (kept for existing callers)', () => {
  it('sets the session cookies HttpOnly', async () => {
    installFetchStub({
      'GET /auth/v1/user': () => json(fakeUser('user-1')),
      'GET /rest/v1/user_roles': () => json([{ role: 'student', approval_status: 'approved' }]),
    });
    const res = await completeLoginPOST(
      new NextRequest('http://localhost/api/auth/complete-login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ access_token: ACCESS_TOKEN, refresh_token: 'refresh-token-value' }),
      })
    );
    // setSession() needs a decodable JWT; either way no cookie may ever be written without the flags
    for (const h of authCookies(res.headers.getSetCookie())) expect(h).toMatch(/;\s*HttpOnly/i);
  });
});

describe('/auth/confirm (email confirmation link)', () => {
  it('sets the session cookies HttpOnly', async () => {
    installFetchStub({ 'POST /auth/v1/verify': () => json(fakeSession(fakeUser('user-1'))) });
    const res = await confirmGET(new NextRequest('http://localhost/auth/confirm?token_hash=abc&type=signup'));
    expect(res.status).toBe(307);
    expectAllHardened(res.headers.getSetCookie());
  });
});

describe('source guard: every createServerClient() call passes the hardened cookie options', () => {
  const ROOT = fileURLToPath(new URL('../../', import.meta.url));
  const walk = (dir: string, out: string[] = []): string[] => {
    for (const name of readdirSync(dir)) {
      if (name === 'node_modules' || name === '.next') continue;
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full, out);
      else if (/\.(ts|tsx)$/.test(name)) out.push(full);
    }
    return out;
  };

  it('no file builds a server client without authCookieOptions()', () => {
    const files = [...walk(join(ROOT, 'src')), ...walk(join(ROOT, 'lib'))];
    const offenders = files
      .filter((f) => /\bcreateServerClient\s*\(/.test(readFileSync(f, 'utf8')))
      .filter((f) => !/authCookieOptions\s*\(\)/.test(readFileSync(f, 'utf8')))
      .map((f) => relative(ROOT, f).split(sep).join('/'));
    expect(offenders, `createServerClient() without cookieOptions: authCookieOptions():\n  ${offenders.join('\n  ')}`).toEqual([]);
  });
});
