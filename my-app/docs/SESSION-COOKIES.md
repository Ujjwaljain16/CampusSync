# Session cookies

How a signed-in session works in CampusSync, and what the owner must check after deploying the HttpOnly-session change.

## What changed

Before, the browser held a Supabase client (`createBrowserClient`) that signed users in and stored the session in
`document.cookie`. Any script running on the page (for example through an XSS bug) could read those cookies.

Now **the session exists only in HttpOnly cookies written by the server**. No client code reads, writes or listens to
the session, and there is no browser Supabase client left in `src/`.

| Cookie | Written by | Flags |
| --- | --- | --- |
| `sb-<project>-auth-token` (+ `.0`, `.1` chunks) | server only | `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, library lifetime |
| `sb-<project>-auth-token-code-verifier` (PKCE, short lived) | server only | same |

`Secure` is on everywhere except `next dev` (`NODE_ENV === 'development'`). The options live in one place,
`src/lib/supabase/cookieOptions.ts`, and are passed as `cookieOptions` to every `createServerClient()` call (server
client, middleware refresh, OAuth start/callback, email confirmation, login). A test fails if a new call forgets them.

Note: a production build served over plain `http://localhost` (for example `next start` on a laptop) will not keep the
`Secure` cookies in some browsers (Safari). Use `next dev`, or https, for local sign-in.

## Flows

| Flow | How it works now |
| --- | --- |
| Email + password login | Login page calls `POST /api/auth/login`. The server signs in and the response carries the HttpOnly cookies. The response body has `role`, `organization_id`, `approval_status` and `redirectTo`, never a token. Wrong email, wrong password and unknown account all give the same 401 message. Rate limited per client address and per account. |
| Google login | Unchanged: `/api/auth/oauth/google` starts it, `/api/auth/callback` finishes it. Both now write HttpOnly cookies. |
| Email confirmation (signup) | Unchanged: `/auth/confirm` verifies the token and writes HttpOnly cookies. |
| Session refresh | The middleware refreshes an expiring session on page requests and rewrites the cookies HttpOnly. API routes read the cookies on every request. |
| Logout | `LogoutButton` calls `POST /api/auth/signout` (server ends the session and clears the cookies), clears the per-user organization selection from `localStorage`, tells other tabs, and goes to `/login`. |
| Forgot password | `POST /api/auth/password-reset/request` (generic 200 answer for every address, limited per address and per mailbox). The server stores the PKCE verifier cookie. |
| Reset link opened | Either `/reset-password?token_hash=...&type=recovery` (the page posts the token to `POST /api/auth/password-reset/verify`, which sets the cookies), or the PKCE `code` flow through `/api/auth/callback?redirectTo=/reset-password` (the callback exchanges the code, then goes straight to `/reset-password`). |
| New password | `POST /api/auth/password-reset/update` needs the recovery session cookie, applies the same password rule as the page (8 to 72 bytes), sets the password, then ends **all** of the user's sessions (global sign-out). The user logs in again. |

`POST /api/auth/complete-login` (token hand-over from the old browser login) is no longer called by the app. It is
kept, unchanged apart from the cookie flags, for any external caller.

## Why polling replaced realtime

The waiting pages (`/waiting`, `/faculty/waiting`, `/recruiter/waiting`) used a browser realtime subscription to see
the approval change. That needs the session token in script, which no longer exists. They now poll the server
(`src/hooks/usePolling.ts`):

- every 10 seconds while the tab is visible, every 60 seconds while it is hidden, immediately when it becomes visible;
- the delay doubles after each failed request (capped at 2 minutes) and resets after a success;
- polls never overlap, and everything is cleaned up on unmount;
- polling stops after the redirect to the dashboard, or after a redirect to `/login` when the session is gone.

Faculty and recruiter pages read `GET /api/auth/approval-status?role=faculty|recruiter`; `/waiting` reads
`GET /api/recruiter/request-access`. Approval therefore shows up within about 10 seconds instead of instantly.

`OrganizationContext` no longer listens for auth state. It loads `/api/auth/me` and `/api/organizations` (or the
super-admin organization list), refreshes when the window regains focus (at most every 30 seconds), and reacts to the
login/logout signal in `src/lib/authEvents.ts` (same tab, and other tabs through `BroadcastChannel`).

## Supabase dashboard settings to check

- Authentication, URL Configuration: the Site URL is the production origin, and the redirect allow-list contains
  `<site>/api/auth/callback**` (the reset email's `redirectTo` is `<site>/api/auth/callback?redirectTo=%2Freset-password`;
  the Google flow already uses the same callback) and `<site>/reset-password`.
- `NEXT_PUBLIC_SITE_URL` should be set to the production origin; the reset request falls back to the request origin.
- The reset email template can stay as documented in `SUPABASE_EMAIL_TEMPLATES.md` (`/reset-password?token_hash=...`).
  Both link styles work. The PKCE-code style only works if the link is opened in the **same browser** that asked for
  the reset (the verifier cookie is there).

`docs/Password-reset.md` describes the previous browser-side flow and is out of date; this file replaces its
"Summary" and "Steps" sections.

## Existing sessions

Cookies written by the old browser client are not HttpOnly. They keep working. The next time the middleware refreshes
the session (the access token lasts about an hour) the server rewrites them HttpOnly, and a fresh login writes them
HttpOnly immediately. To force it for everyone, end the sessions in the Supabase dashboard (or ask users to sign out and
in). The check "the `sb-*` cookie is gone from `document.cookie`" is only true for a session created or refreshed after
this release.

## Known limits

- The password update route accepts any valid session, not only a recovery session. That matches the previous
  behaviour (the browser called `updateUser` directly). Supabase's "require current password / recent login to change
  password" project setting is the way to tighten it.
- The in-memory rate limiter is per server instance (see `src/lib/rateLimit.ts`); on serverless hosting it is a best
  effort brake, not a guarantee.
- An attacker who can run script on a page can still make requests as the user (same-origin `fetch`) while the page is
  open; HttpOnly stops them from copying the session out. Keep the Content-Security-Policy strict.

## Manual smoke checklist (owner, after deploying)

Use a private window per scenario so no old cookies interfere.

1. Email + password login, one account of each role: student, faculty (approved), faculty (pending, should land on
   `/faculty/waiting`), recruiter (approved), recruiter (pending, should land on `/recruiter/waiting`), admin or org
   admin, super admin. Each lands on the expected dashboard.
2. Wrong password, and an email that has no account: the same "Invalid email or password" message for both.
3. Google login for an existing user, and for a brand-new Google user (goes to signup).
4. Refresh the page after login, and open another tab: the session is kept. Leave a tab for over an hour (or wait for a
   token refresh) and reload: still signed in.
5. Logout: lands on `/login`; the back button and a direct URL to a dashboard send you to `/login`. If a second tab was
   open, it falls back to signed-out after a click or when it regains focus.
6. Forgot password: enter an address with an account and one without; both show the same message. Open the email link in
   the same browser, set a new password (a 7-character password is refused), you are sent to `/login`, the old
   password no longer works and the new one does. A link used twice, or an old link, shows "invalid or expired".
7. Waiting page: with a pending faculty and a pending recruiter account on the waiting pages, approve each from an
   admin account. Within about 10 seconds (a few seconds after switching back to the tab) each page redirects to its
   dashboard. Check the browser network tab shows one request about every 10 seconds, and nothing to `realtime`.
8. Organization switcher still lists the right organizations for a user with several, and for a super admin.
9. In the browser console on any signed-in page, `document.cookie` does **not** list any `sb-*` cookie, and the
   Application/Storage cookie view shows them with HttpOnly and Secure ticked.
10. `/test-email` is still a 404 in production.

## Rollback

Revert the pull request and redeploy. After a rollback the old browser login comes back; a user who still holds an
HttpOnly cookie signs in through `complete-login`, which overwrites it from the server, so signing out and in again is
enough. If a browser seems stuck, clearing the site's cookies fixes it. No database or Supabase configuration changed,
so there is nothing else to undo.
