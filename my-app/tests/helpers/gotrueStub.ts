/**
 * Test helper: lets the REAL @supabase/ssr + @supabase/supabase-js run against a fake auth server.
 *
 * - `installFetchStub(handlers)` replaces global fetch; requests are matched by "METHOD /path" prefix and
 *   every call is recorded in `calls`.
 * - `cookieJar` is a stand-in for next/headers' cookies() store: it remembers what the code under test sets
 *   (name, value, options) so tests can inspect the exact cookie attributes and replay them on later requests.
 *
 * Usage in a test file (the vi.mock call must live in the test file itself):
 *   vi.mock('next/headers', () => ({ cookies: async () => cookieJar.store }));
 */
import { vi } from 'vitest';

export const SUPABASE_URL = 'https://proj.supabase.test';
export const COOKIE_PREFIX = 'sb-proj-auth-token';

export interface SetCookie {
  name: string;
  value: string;
  options: Record<string, unknown>;
}

export const cookieJar = {
  jar: new Map<string, string>(),
  sets: [] as SetCookie[],
  reset() {
    this.jar.clear();
    this.sets.length = 0;
  },
  store: {
    getAll: () => Array.from(cookieJar.jar.entries()).map(([name, value]) => ({ name, value })),
    get: (name: string) => (cookieJar.jar.has(name) ? { name, value: cookieJar.jar.get(name)! } : undefined),
    set: (name: string, value: string, options: Record<string, unknown> = {}) => {
      cookieJar.sets.push({ name, value, options });
      if (value === '' || options.maxAge === 0) cookieJar.jar.delete(name);
      else cookieJar.jar.set(name, value);
    },
  },
};

export interface Call {
  method: string;
  path: string;
  url: URL;
  body: unknown;
  headers: Headers;
}

export type Handler = (call: Call) => Response | Promise<Response>;

export const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

export const calls: Call[] = [];

export function fakeUser(id = 'user-1', email = 'user@campus.test') {
  return {
    id,
    aud: 'authenticated',
    role: 'authenticated',
    email,
    email_confirmed_at: '2026-01-01T00:00:00Z',
    app_metadata: {},
    user_metadata: {},
    created_at: '2026-01-01T00:00:00Z',
  };
}

/** A structurally valid (unsigned) JWT, which is all the client library decodes. */
export const ACCESS_TOKEN = [
  Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'),
  Buffer.from(JSON.stringify({ sub: 'user-1', aud: 'authenticated', role: 'authenticated', exp: 4102444800 })).toString('base64url'),
  'signature',
].join('.');

export function fakeSession(user = fakeUser(), expiresInSeconds = 3600) {
  return {
    access_token: ACCESS_TOKEN,
    refresh_token: 'refresh-token-value',
    token_type: 'bearer',
    expires_in: expiresInSeconds,
    expires_at: Math.floor(Date.now() / 1000) + expiresInSeconds,
    user,
  };
}

/** The cookie value @supabase/ssr stores for a session ("base64-" + base64url(JSON)). */
export function sessionCookieValue(session: ReturnType<typeof fakeSession>): string {
  return 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64url');
}

export function installFetchStub(handlers: Record<string, Handler>) {
  calls.length = 0;
  const impl = async (input: unknown, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url);
    const method = (init?.method ?? (input as Request)?.method ?? 'GET').toUpperCase();
    let body: unknown = undefined;
    if (typeof init?.body === 'string') {
      try {
        body = JSON.parse(init.body);
      } catch {
        body = init.body;
      }
    }
    const call: Call = { method, path: url.pathname, url, body, headers: new Headers(init?.headers) };
    calls.push(call);
    const key = Object.keys(handlers).find((k) => {
      const [m, p] = k.split(' ');
      return m === method && url.pathname.startsWith(p);
    });
    if (!key) throw new Error(`Unexpected request: ${method} ${url.pathname}`);
    return handlers[key](call);
  };
  vi.stubGlobal('fetch', impl);
}

export const setEnv = () => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', SUPABASE_URL);
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key');
};
