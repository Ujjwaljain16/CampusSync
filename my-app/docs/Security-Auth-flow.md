# Security and authentication flow

This page describes what the code actually does. For the broader picture see [ARCHITECTURE.md](./ARCHITECTURE.md).

## Sign-in and session

The session exists only in HttpOnly cookies written by the server (details, cookie flags and the manual smoke
checklist: [SESSION-COOKIES.md](./SESSION-COOKIES.md)). There is no Supabase client in the browser.

```mermaid
sequenceDiagram
    autonumber
    participant B as Browser
    participant MW as src/middleware.ts
    participant API as /api/* route
    participant A as Supabase Auth
    participant DB as Postgres

    B->>API: POST /api/auth/login { email, password } (Google: GET /api/auth/oauth/google, then /api/auth/callback)
    API->>A: signInWithPassword (server-side)
    A-->>API: session
    API-->>B: Set-Cookie sb-*-auth-token (HttpOnly, SameSite=Lax, Secure in production); body has role, organization_id, approval_status, redirectTo, never a token
    B->>MW: page request + cookies
    MW->>A: auth.getUser() (refreshes an expiring session, rewrites the cookies HttpOnly)
    alt not signed in and page is not public
        MW-->>B: redirect to /login?redirectedFrom=...
    else faculty/recruiter with pending or denied approval
        MW-->>B: redirect to /faculty/waiting or /recruiter/waiting
    else
        MW-->>B: page
    end
    B->>API: fetch /api/... (the middleware matcher EXCLUDES /api)
    API->>A: auth.getUser() (withAuth / withRole / explicit call)
    API->>DB: query with the user's JWT (RLS applies) or with the service-role key (RLS bypassed)
    B->>API: POST /api/auth/signout (LogoutButton)
    API-->>B: session ended, cookies cleared
```

Key points:

- The session cookies are **HttpOnly**, `SameSite=Lax`, `Path=/`, and `Secure` everywhere except `next dev`. Script on
  the page cannot read them. The options live in `src/lib/supabase/cookieOptions.ts` and are passed to every
  `createServerClient()` call (a test fails when a call forgets them). XSS on the origin can still make same-origin
  requests as the user while the page is open, so keep the Content-Security-Policy strict (it still allows
  `'unsafe-inline'` scripts, see below). There is no server-side session store beyond Supabase Auth.
- Email + password login goes through `POST /api/auth/login`. A wrong email, a wrong password and an unknown account
  give the same 401 message. The route is rate limited per client address and per account with the in-memory limiter.
  `POST /api/auth/complete-login` (the former token hand-over from the browser login) is no longer called by the app; it
  is kept for external callers and is globally rate limited.
- Logout is `POST /api/auth/signout`. Password reset also runs on the server, see [Password-reset.md](./Password-reset.md).
- Sessions created before this change were written by the old browser client without HttpOnly; the middleware rewrites
  them HttpOnly on the next refresh (see "Existing sessions" in SESSION-COOKIES.md).
- The waiting pages poll the server for the approval status (`src/hooks/usePolling.ts`); no client code listens to
  Supabase realtime.
- The middleware **authenticates and redirects only** (plus a 404 for `/test-*` and `/debug-*` in production and a
  redirect to `/setup` when the Supabase URL / anon key are missing). It never returns 403 and does not check role
  permissions for pages. Authorization is enforced in API routes (and by RLS where a user-bound client is used).
- `/api/*` is excluded from the middleware matcher, so every route authenticates itself. The list of routes without
  a recognised guard, each with a justification, is `tests/security/route-inventory.test.ts`.
- Nothing sets Postgres session variables such as `organization_id` or `role` for RLS. Any RLS policy has to derive
  tenancy from `auth.uid()` and table lookups (for example `user_roles`) or JWT claims, not from custom settings.

## Authorization in routes

| Helper | File | Behaviour |
|--------|------|-----------|
| `withAuth(handler)` | `src/lib/api/middleware/auth.ts` | 401 when `auth.getUser()` fails. An unexpected exception is logged through `logger.error` (which raises an alert when `ALERT_WEBHOOK_URL` is set) and answered with a 500. |
| `withRole(roles, handler)` | same | 403 unless `requireRole(roles)` succeeds; unexpected exceptions are handled like `withAuth`. |
| `withSession(handler)` | `src/lib/api/middleware/routeAuth.ts` | 401 when `auth.getUser()` fails; also forwards Next.js route params; unexpected errors become a generic 500. |
| `withSuperAdmin(handler)` | same | `withSession` plus an approved `super_admin` row (403 otherwise). |
| `requireRole(roles)` | `src/lib/supabaseServer.ts` | Uses the user's highest-priority role among their approved rows across all organizations; a user whose only rows are `pending`/`denied` is refused. |
| `authorizeOrg(user, { orgId, minRole / roles })` | `src/lib/api/utils/authorize.ts` | Requires an approved role of sufficient rank **in that organization** (super admins pass everywhere). `resolveAdminOrg` wraps it for admin routes. |
| `getOrganizationContext(user, orgId?)` | `src/lib/api/utils/organization.ts` | Resolves the organization (header `X-Organization-ID` / body `organization_id`, verified against approved `user_roles` rows), else the user's highest-privilege approved row; super admins may pick any, recruiters get their approved per-organization `user_roles` set. |
| `recruiterRoute(options, handler)` | `src/lib/privacy/recruiterAccess.ts` | Authenticates, requires an approved platform-level recruiter row and at least one approved organization row, validates `X-Organization-ID`, rate limits per user. |

Roles (6): `student`, `faculty`, `admin`, `recruiter`, `org_admin`, `super_admin`. Authorization comes only from
`user_roles`; no other column is trusted for it.

`withRole` is a global check (role held in any organization). Multi-tenant routes must additionally scope by
organization with `authorizeOrg` / `getOrganizationContext` and filter queries by `organization_id`. How many route
files use each helper is listed in [ARCHITECTURE.md](./ARCHITECTURE.md#guards-in-use).

## Service-role usage

44 route files call `createSupabaseAdminClient()` (the service-role client, which bypasses RLS), a few more build one
directly, and shared helpers (`writeAudit`, `recruiterRoute`, the global rate limiter, the signed-URL helper) use it
too. In those routes the explicit checks in the route are the only access control. Credential rows and audit rows are
written only this way, after the route's own authorization. Review any new use carefully, and never import the admin
client into client components (a test fails if `process.env.SUPABASE_SERVICE_ROLE_KEY` appears in `page.tsx` or
`src/components`).

## Database security model

The schema cleanup `supabase/migrations/20261015_*` (steps 00 to 08) has been applied to production, together with the
matching code. The policy model per table is in [DATABASE-SCHEMA.md](./DATABASE-SCHEMA.md) (section 6) and which
migrations are applied is in its "Migration status" section. The migrations are versioned patches, not a complete
baseline dump of the original schema; only the policies they create or rewrite are in this repository.

- Row-Level Security is the second wall for user-bound clients; privileged writes go through the backend.
- `audit_logs` is append-only. Only the backend writes it; signed-in users read their own rows, organization admins
  their organization's rows, super admins all.
- `verifiable_credentials` is written by the backend only; the database allows one active credential per certificate.
- Revocation lives on `verifiable_credentials` (no `revocation_list` table).
- Certificate files: the code serves them only through `GET /api/certificates/[id]/file`, which checks authorization and
  returns a signed URL valid for 300 seconds ([PRIVATE-STORAGE.md](./PRIVATE-STORAGE.md)). The migration that makes the
  `certificates` bucket private (`20261016_01_private_certificates_bucket.sql`) is an owner step to run **after** the
  code is deployed; until it is applied the bucket is still public. Production status: "Migration status" in
  [DATABASE-SCHEMA.md](./DATABASE-SCHEMA.md).
- Specifics of individual policies are intentionally not described in this public repository.

## Other controls

- Rate limiting has two layers ([RATE-LIMITING.md](./RATE-LIMITING.md)). The in-memory limiter in `src/lib/rateLimit.ts`
  (per instance, best effort on serverless) covers many endpoints, including login and the password-reset routes. A
  Postgres-backed global limiter (`src/lib/rateLimitGlobal.ts`, `rate_limit_hit`) is added on login completion, signup,
  the email checks, OCR, public verification, the public portfolio and the SD routes. It needs migration
  `20261016_02_rate_limits.sql` (an owner step; without it the global part fails open to the in-memory limiter).
- Unexpected server errors can raise a throttled, redacted webhook alert when `ALERT_WEBHOOK_URL` is set
  ([MONITORING.md](./MONITORING.md)).
- Redirect targets after login are validated by `src/lib/safeRedirect.ts`.
- Credentials are signed with the key in `VC_ISSUER_JWK`; see SECURITY.md and [KEY-ROTATION.md](./KEY-ROTATION.md).
- `next.config.ts` sets security headers (HSTS, `X-Frame-Options: DENY`, `nosniff`, a Content-Security-Policy that still
  allows `'unsafe-inline'` scripts, and others). Header values are configuration, not a guarantee of XSS safety.

## Not implemented

- MFA.
- Per-organization (rather than global) role checks in `withRole`.
