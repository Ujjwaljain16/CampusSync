# Rate limiting

CampusSync has two limiters. They are used together on the sensitive endpoints.

| | `src/lib/rateLimit.ts` | `src/lib/rateLimitGlobal.ts` |
|---|---|---|
| storage | in-memory `Map`, per server instance | Postgres table `public.rate_limits` (shared by every instance) |
| API | `enforceRateLimit(req, scope, preset, key?)` (synchronous) | `await enforceGlobalRateLimit(req, scope, { limit, windowSeconds }, key?)` |
| strength | cheap, always available, but on serverless every instance has its own counters, so it only slows abuse down | one counter for all instances, atomic |
| on failure | n/a | fails open (see below) |

Both return `Response | null`: a `429` with a `Retry-After` header and `{ "error": "Too many requests. Please try again later." }`, or `null` when the request may proceed.
In the routes the cheap in-memory check runs first, then the global one.

## What is limited globally

| scope | route | key | limit |
|---|---|---|---|
| `complete-login` | `POST /api/auth/complete-login` | client | 60 / 1 min (generous: campus networks share addresses) |
| `signup` | `POST /api/auth/signup/recruiter`, `/student-faculty` | client | 10 / 15 min |
| `check-email` | `POST /api/auth/check-email` | client | 20 / 1 min |
| `validate-email` | `POST /api/auth/validate-email` | client | 20 / 1 min |
| `check-user-exists` | `POST /api/auth/check-user-exists` | client | 10 / 1 min |
| `resend-confirmation` | `POST /api/auth/resend-confirmation` | client | 5 / 10 min |
| `resend-confirmation-email` | same route | e-mail address | 3 / 10 min |
| `ocr-gemini`, `ocr-gemini-daily` | `POST /api/certificates/ocr-gemini` | user id | 6 / 1 min and 50 / 24 h |
| `vcs-verify` | `GET /api/vcs/verify` | client | 30 / 1 min |
| `public-portfolio` | `GET /api/public/portfolio/[userId]` | client | 30 / 1 min |
| `sd-issue` | `POST /api/credentials/sd/issue` | user id | 10 / 1 min |
| `sd-verify` | `POST /api/credentials/sd/verify` | client | 30 / 1 min |

"Client" is the identity the in-memory limiter uses (`getClientIp`: `x-vercel-forwarded-for`, then `x-real-ip`, then the first `x-forwarded-for` entry). The password-reset routes (`/api/auth/password-reset/*`) and `/api/auth/login` are limited by the in-memory limiter only; they are not wired to the global limiter.

Windows are fixed and aligned to the epoch (`floor(now / window) * window`), so a client can burst up to twice the limit across a window boundary; that is the accepted trade-off for a single atomic upsert.

## Table and function

Migration: `supabase/migrations/20261016_02_rate_limits.sql`.

* `public.rate_limits (key text, window_start timestamptz, count integer, primary key (key, window_start))`. RLS is enabled with no policies, and all privileges are revoked from `anon` and `authenticated`: only the service role (which bypasses RLS) can touch it.
* `public.rate_limit_hit(p_key text, p_window_seconds integer, p_limit integer) returns table (allowed boolean, remaining integer, reset_at timestamptz)`: `SECURITY DEFINER`, `search_path = public, pg_temp`, executable by `service_role` only. It validates its arguments (key 1..200 characters, window 1..86400 s, limit 1..100000), upserts the counter of the current window in one statement (`insert ... on conflict (key, window_start) do update set count = count + 1`, so concurrent callers serialize on the row and never over-admit) and deletes a small batch (20) of windows older than one day per call, so the table stays small without a scheduled job.
* The key stored is `scope:` + SHA-256 of the client identity, so IP addresses and e-mail addresses are not kept in clear. (A plain hash of a small space such as IPv4 can be reversed by brute force; treat the table as sensitive anyway, it is service-role only.)

## Failure behaviour: fail open

The limiter must never take the application down or lock people out because of the database.

* If the RPC returns an error, times out (800 ms), returns something unexpected, or the function / table does not exist yet, the request is **not blocked** by the global limiter. A warning is written with `console.warn` (`[rate-limit] global limiter unavailable ...`), and the decision falls back to the in-memory limiter for that request (under its own counter, `global:<scope>`, so it does not double count with the route-level check).
* A short in-process circuit breaker: after 3 consecutive failures the RPC is skipped for 30 s (only the in-memory fallback runs), so a database problem adds no latency per request. After 30 s the next request probes again; a success closes the breaker, a failure re-opens it at once.
* `enforceGlobalRateLimit` never throws.

Consequence: the code works before the migration is applied (in fail-open mode, warnings in the logs, in-memory protection only).

## Applying the migration

1. Deploy the application code first.
2. Apply `supabase/migrations/20261016_02_rate_limits.sql` (SQL editor or `supabase db push`). It is idempotent and runs in one transaction.
3. Confirm the warnings stop. Quick check as the service role: `select * from public.rate_limit_hit('smoke-test', 60, 5);` returns `allowed = true`. Remove the test row with `delete from public.rate_limits where key = 'smoke-test';`.

Rollback: `drop function public.rate_limit_hit(text, integer, integer); drop table public.rate_limits;` (the code simply fails open again).

The migration is covered by the PGlite harness in `supabase/tests` (counter, flip to blocked, new window, privileges, argument validation, cleanup).

## Tuning

Limits are literals at each call site (`{ limit, windowSeconds }`), next to the in-memory preset of the same route. To change one, edit both so the two limiters agree. Keep `windowSeconds` between 1 and 86400 and `limit` between 1 and 100000 (the function rejects anything else, which would then fail open). To protect another endpoint, add:

```ts
const limited = enforceRateLimit(req, 'my-scope', RateLimitPresets.relaxed);
if (limited) return limited;
const globalLimited = await enforceGlobalRateLimit(req, 'my-scope', { limit: 30, windowSeconds: 60 }, userIdOrUndefined);
if (globalLimited) return globalLimited;
```

Use it only on the few endpoints where a shared counter matters (each call is one database round trip, at most 800 ms).

## Known limits

* Fixed windows (burst up to 2x across a boundary).
* Fail open means a database outage disables the global part; the in-memory limiter keeps working per instance.
* Client identity is only as trustworthy as the proxy headers (see `getClientIp`).
