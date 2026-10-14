import type { CookieOptionsWithName } from '@supabase/ssr';

/**
 * Cookie attributes for every Supabase auth cookie that the server writes (session, PKCE code verifier).
 *
 * The session must only ever live in HttpOnly cookies set by the server, so no script on the page can read
 * it. `maxAge` is intentionally left out: @supabase/ssr supplies its own lifetime (and `maxAge: 0` when it
 * removes a cookie).
 *
 * `secure` is on everywhere except `next dev`, where the site is served over plain http.
 */
export function authCookieOptions(): CookieOptionsWithName {
  return {
    path: '/',
    sameSite: 'lax',
    httpOnly: true,
    secure: process.env.NODE_ENV !== 'development',
  };
}
