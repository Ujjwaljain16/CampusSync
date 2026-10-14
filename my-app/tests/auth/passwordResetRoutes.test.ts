// @vitest-environment node
/**
 * Password reset routes, run against the real @supabase/ssr + supabase-js with a fake auth server.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import {
  cookieJar,
  calls,
  json,
  fakeSession,
  fakeUser,
  installFetchStub,
  setEnv,
  COOKIE_PREFIX,
  sessionCookieValue,
  type Handler,
} from '../helpers/gotrueStub';
import { __resetRateLimitStore } from '@/lib/rateLimit';

vi.mock('next/headers', () => ({ cookies: async () => cookieJar.store }));

import { POST as requestReset } from '@/app/api/auth/password-reset/request/route';
import { POST as updatePassword } from '@/app/api/auth/password-reset/update/route';
import { POST as verifyToken } from '@/app/api/auth/password-reset/verify/route';

let nextIp = 0;
function post(path: string, body: unknown, ip = `10.1.0.${++nextIp}`): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-real-ip': ip },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  setEnv();
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://campus.example');
  cookieJar.reset();
  __resetRateLimitStore();
  nextIp = 0;
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const recoverOk: Handler = () => json({});

describe('POST /api/auth/password-reset/request', () => {
  const GENERIC = 'If an account exists for that email address, a password reset link has been sent.';

  it('answers 200 with the generic message and asks the auth server to mail a link back through /api/auth/callback', async () => {
    installFetchStub({ 'POST /auth/v1/recover': recoverOk });
    const res = await requestReset(post('/api/auth/password-reset/request', { email: ' Student@Campus.test ' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, message: GENERIC });

    const call = calls.find((c) => c.path === '/auth/v1/recover')!;
    expect(call.body).toMatchObject({ email: 'Student@Campus.test' });
    expect(call.url.searchParams.get('redirect_to')).toBe(
      'https://campus.example/api/auth/callback?redirectTo=%2Freset-password'
    );
  });

  it('stores the PKCE code verifier in an HttpOnly cookie set by the server', async () => {
    installFetchStub({ 'POST /auth/v1/recover': recoverOk });
    await requestReset(post('/api/auth/password-reset/request', { email: 'a@campus.test' }));
    const verifier = cookieJar.sets.find((c) => c.name === `${COOKIE_PREFIX}-code-verifier`);
    expect(verifier).toBeTruthy();
    expect(verifier!.options).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/', secure: true });
    expect((calls[0].body as Record<string, unknown>).code_challenge).toBeTruthy();
  });

  it('falls back to the request origin when no site URL is configured', async () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', '');
    installFetchStub({ 'POST /auth/v1/recover': recoverOk });
    await requestReset(post('/api/auth/password-reset/request', { email: 'a@campus.test' }));
    expect(calls[0].url.searchParams.get('redirect_to')).toBe('http://localhost/api/auth/callback?redirectTo=%2Freset-password');
  });

  it('answers the same whether the auth server accepts, rejects, or is unreachable (no account enumeration)', async () => {
    const outcomes: Array<[string, Handler]> = [
      ['ok', recoverOk],
      ['unknown user', () => json({ error_code: 'user_not_found', msg: 'User not found' }, 404)],
      ['mail rate limit', () => json({ error_code: 'over_email_send_rate_limit', msg: 'rate' }, 429)],
      ['server error', () => json({ msg: 'down' }, 500)],
      [
        'network error',
        () => {
          throw new TypeError('fetch failed');
        },
      ],
    ];
    const bodies: string[] = [];
    for (const [i, [, handler]] of outcomes.entries()) {
      __resetRateLimitStore();
      installFetchStub({ 'POST /auth/v1/recover': handler });
      const res = await requestReset(post('/api/auth/password-reset/request', { email: `user${i}@campus.test` }));
      expect(res.status).toBe(200);
      bodies.push(await res.text());
    }
    expect(new Set(bodies).size).toBe(1);
  });

  it.each([
    ['no body', ''],
    ['not json', 'nope'],
    ['no email', {}],
    ['not an email', { email: 'nope' }],
    ['non-string email', { email: 42 }],
  ])('rejects %s with 400 and sends nothing', async (_n, body) => {
    installFetchStub({ 'POST /auth/v1/recover': recoverOk });
    const res = await requestReset(post('/api/auth/password-reset/request', body));
    expect(res.status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it('allows 3 requests per mailbox per window, then 429 (mail-bomb brake), regardless of client address', async () => {
    installFetchStub({ 'POST /auth/v1/recover': recoverOk });
    for (let i = 0; i < 3; i++) {
      expect((await requestReset(post('/api/auth/password-reset/request', { email: 'victim@campus.test' }))).status).toBe(200);
    }
    const limited = await requestReset(post('/api/auth/password-reset/request', { email: 'VICTIM@campus.test' }));
    expect(limited.status).toBe(429);
    expect(limited.headers.get('retry-after')).toBeTruthy();
    expect(calls).toHaveLength(3);
  });

  it('limits requests per client address', async () => {
    installFetchStub({ 'POST /auth/v1/recover': recoverOk });
    for (let i = 0; i < 10; i++) {
      expect((await requestReset(post('/api/auth/password-reset/request', { email: `u${i}@campus.test` }, '192.0.2.1'))).status).toBe(200);
    }
    expect((await requestReset(post('/api/auth/password-reset/request', { email: 'u99@campus.test' }, '192.0.2.1'))).status).toBe(429);
  });
});

describe('POST /api/auth/password-reset/verify', () => {
  it('exchanges the email token for a session cookie set by the server (HttpOnly)', async () => {
    installFetchStub({ 'POST /auth/v1/verify': () => json(fakeSession()) });
    const res = await verifyToken(post('/api/auth/password-reset/verify', { token_hash: 'abc123', type: 'recovery' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(calls[0].body).toMatchObject({ token_hash: 'abc123', type: 'recovery' });
    const session = cookieJar.sets.filter((c) => c.name.startsWith(COOKIE_PREFIX));
    expect(session.length).toBeGreaterThan(0);
    session.forEach((c) => expect(c.options).toMatchObject({ httpOnly: true, sameSite: 'lax' }));
  });

  it('refuses an invalid or expired token with one message and sets no cookie', async () => {
    installFetchStub({ 'POST /auth/v1/verify': () => json({ error_code: 'otp_expired', msg: 'Email link is invalid or has expired' }, 403) });
    const res = await verifyToken(post('/api/auth/password-reset/verify', { token_hash: 'old', type: 'recovery' }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid or expired reset link. Please request a new one.' });
    expect(cookieJar.sets).toHaveLength(0);
  });

  it.each([
    ['missing token', { type: 'recovery' }],
    ['wrong type', { token_hash: 'abc', type: 'signup' }],
    ['no type', { token_hash: 'abc' }],
    ['oversized token', { token_hash: 'a'.repeat(600), type: 'recovery' }],
  ])('rejects %s without calling the auth server', async (_n, body) => {
    installFetchStub({ 'POST /auth/v1/verify': () => json(fakeSession()) });
    expect((await verifyToken(post('/api/auth/password-reset/verify', body))).status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it('is rate limited per client address', async () => {
    installFetchStub({ 'POST /auth/v1/verify': () => json({ msg: 'no' }, 403) });
    for (let i = 0; i < 20; i++) await verifyToken(post('/api/auth/password-reset/verify', { token_hash: `t${i}`, type: 'recovery' }, '192.0.2.5'));
    expect((await verifyToken(post('/api/auth/password-reset/verify', { token_hash: 'x', type: 'recovery' }, '192.0.2.5'))).status).toBe(429);
  });
});

describe('POST /api/auth/password-reset/update', () => {
  /** Puts a valid recovery session into the cookie jar, like the callback / verify route would have. */
  function haveSession() {
    cookieJar.jar.set(COOKIE_PREFIX, sessionCookieValue(fakeSession(fakeUser('user-1'))));
  }

  const userHandlers = (extra: Record<string, Handler> = {}) => ({
    'GET /auth/v1/user': () => json(fakeUser('user-1')),
    'PUT /auth/v1/user': () => json(fakeUser('user-1')),
    'POST /auth/v1/logout': () => new Response(null, { status: 204 }),
    ...extra,
  });

  it('requires a session: 401 without cookies, and the password is never sent anywhere', async () => {
    installFetchStub(userHandlers());
    const res = await updatePassword(post('/api/auth/password-reset/update', { password: 'a-long-enough-password' }));
    expect(res.status).toBe(401);
    expect(calls.filter((c) => c.method === 'PUT')).toHaveLength(0);
  });

  it('requires a session that the auth server still accepts', async () => {
    haveSession();
    installFetchStub(userHandlers({ 'GET /auth/v1/user': () => json({ error_code: 'bad_jwt', msg: 'invalid JWT' }, 401) }));
    const res = await updatePassword(post('/api/auth/password-reset/update', { password: 'a-long-enough-password' }));
    expect(res.status).toBe(401);
    expect(calls.filter((c) => c.method === 'PUT')).toHaveLength(0);
  });

  it.each([
    ['too short', 'short'],
    ['empty', ''],
    ['seven characters', '1234567'],
    ['over 72 bytes', 'x'.repeat(73)],
    ['not a string', 123456789],
  ])('refuses a weak password (%s) before touching the session', async (_n, password) => {
    haveSession();
    installFetchStub(userHandlers());
    const res = await updatePassword(post('/api/auth/password-reset/update', { password }));
    expect(res.status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it('accepts exactly 8 characters', async () => {
    haveSession();
    installFetchStub(userHandlers());
    expect((await updatePassword(post('/api/auth/password-reset/update', { password: '12345678' }))).status).toBe(200);
  });

  it('sets the password, then ends every session (global sign-out) and clears the cookies', async () => {
    haveSession();
    installFetchStub(userHandlers());
    const res = await updatePassword(post('/api/auth/password-reset/update', { password: 'a-long-enough-password' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    const put = calls.find((c) => c.method === 'PUT' && c.path === '/auth/v1/user')!;
    expect(put.body).toMatchObject({ password: 'a-long-enough-password' });
    const logout = calls.find((c) => c.path === '/auth/v1/logout')!;
    expect(logout.url.searchParams.get('scope')).toBe('global');
    expect(calls.indexOf(put)).toBeLessThan(calls.indexOf(logout));

    expect(cookieJar.jar.has(COOKIE_PREFIX)).toBe(false);
    const removal = cookieJar.sets.find((c) => c.name === COOKIE_PREFIX && c.options.maxAge === 0);
    expect(removal?.options).toMatchObject({ httpOnly: true });
  });

  it('reports success even if the follow-up sign-out fails (the password did change)', async () => {
    haveSession();
    installFetchStub(userHandlers({ 'POST /auth/v1/logout': () => json({ msg: 'down' }, 500) }));
    const res = await updatePassword(post('/api/auth/password-reset/update', { password: 'a-long-enough-password' }));
    expect(res.status).toBe(200);
  });

  it('maps a same-password rejection to 422 with a safe message', async () => {
    haveSession();
    installFetchStub(userHandlers({ 'PUT /auth/v1/user': () => json({ error_code: 'same_password', msg: 'New password should be different from the old password.' }, 422) }));
    const res = await updatePassword(post('/api/auth/password-reset/update', { password: 'a-long-enough-password' }));
    expect(res.status).toBe(422);
    expect((await res.json()).error).toMatch(/different/i);
    expect(calls.some((c) => c.path === '/auth/v1/logout')).toBe(false);
  });

  it('maps a provider weak-password rejection to 422', async () => {
    haveSession();
    installFetchStub(userHandlers({ 'PUT /auth/v1/user': () => json({ error_code: 'weak_password', msg: 'Password is known to be weak', weak_password: { reasons: ['pwned'] } }, 422) }));
    const res = await updatePassword(post('/api/auth/password-reset/update', { password: 'password1234' }));
    expect(res.status).toBe(422);
  });

  it('answers any other update failure with a generic message', async () => {
    haveSession();
    installFetchStub(userHandlers({ 'PUT /auth/v1/user': () => json({ error_code: 'unexpected_failure', msg: 'secret internal detail' }, 400) }));
    const res = await updatePassword(post('/api/auth/password-reset/update', { password: 'a-long-enough-password' }));
    expect(res.status).toBe(400);
    expect(await res.text()).not.toContain('secret internal detail');
  });

  it('rejects an invalid body with 400', async () => {
    haveSession();
    installFetchStub(userHandlers());
    expect((await updatePassword(post('/api/auth/password-reset/update', 'nope'))).status).toBe(400);
  });

  it('is rate limited per client address', async () => {
    installFetchStub(userHandlers());
    for (let i = 0; i < 10; i++) await updatePassword(post('/api/auth/password-reset/update', { password: 'short' }, '192.0.2.9'));
    expect((await updatePassword(post('/api/auth/password-reset/update', { password: 'short' }, '192.0.2.9'))).status).toBe(429);
  });
});
