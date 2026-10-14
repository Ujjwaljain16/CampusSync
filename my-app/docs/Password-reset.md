# Password reset flow

How password reset works in the current code. The email template guidance lives in
[`SUPABASE_EMAIL_TEMPLATES.md`](./SUPABASE_EMAIL_TEMPLATES.md).

## Summary

- The reset page (`src/app/reset-password/page.tsx`) is a **client component**. It exchanges the one-time
  `token_hash` from the email link by calling `supabase.auth.verifyOtp({ token_hash, type: 'recovery' })`
  **in the browser**. The middleware does not take part in the exchange.
- The session is stored by `@supabase/ssr`'s browser client in cookies written from JavaScript. These cookies are
  **not HttpOnly** (JavaScript on the page can read them), so XSS on the origin could read them. Treat XSS prevention
  and a strict Content-Security-Policy as the mitigation, not cookie flags.
- The middleware matcher covers `/reset-password`, but it only refreshes the session and treats that route as public.
  It does not read `token_hash`.

## Sequence

```mermaid
sequenceDiagram
    participant U as User
    participant L as /login page (client)
    participant S as Supabase Auth
    participant M as Email
    participant R as /reset-password page (client)

    U->>L: "Forgot password", enters email
    L->>L: POST /api/auth/check-user-exists (rate limited)
    L->>S: resetPasswordForEmail(email, redirectTo = SITE_URL/reset-password)
    S->>M: email containing /reset-password?token_hash=...&type=recovery
    M->>U: reset email
    U->>R: opens link
    R->>R: reads ?token_hash and ?type=recovery (a legacy #access_token link is rejected)
    R->>S: verifyOtp({ token_hash, type: recovery })  (from the browser)
    S-->>R: session (stored by the SSR browser client in cookies)
    R->>R: removes the one-time token from the address bar
    U->>R: submits new password (at least 8 characters)
    R->>S: updateUser({ password })
    R->>S: signOut()
    R->>U: redirect to /login with a success message
```

## Steps

1. **Request.** `src/app/login/page.tsx` first calls `/api/auth/check-user-exists` and then
   `supabase.auth.resetPasswordForEmail(email, { redirectTo: <site>/reset-password })`.
2. **Email.** Supabase sends the template configured in the dashboard. The template must link to
   `{{ .SiteURL }}/reset-password?token_hash={{ .TokenHash }}&type=recovery`.
3. **Landing.** The page checks for an `error` query parameter, refuses the legacy hash format (`#access_token=`; it
   asks for a new reset link and clears the fragment), calls `verifyOtp` with the `token_hash` when `type=recovery`
   (and removes the token from the address bar), and otherwise accepts an already established session.
4. **Update.** `supabase.auth.updateUser({ password })`, then `signOut()` and a redirect to `/login`.

## Configuration

- Supabase dashboard, Authentication, URL Configuration: set the Site URL and add `<site>/reset-password` to the
  redirect allow-list.
- Supabase dashboard, Email Templates: use `token_hash` links as above.
- `NEXT_PUBLIC_SITE_URL` is used to build `redirectTo` (falls back to `window.location.origin`).

## Known limitations

- The reset page logs only short error messages to the browser console, never URLs or tokens; a recovery token is a
  credential until it is used, so keep it that way.
- Token lifetime and reuse rules are Supabase settings (not enforced by this repository).
- `/api/auth/check-user-exists` reveals whether an email is registered (user enumeration); it is rate limited
  in-process only.
