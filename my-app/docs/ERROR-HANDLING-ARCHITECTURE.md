# Error handling

What exists today, layer by layer. File references are relative to `my-app/`.

## UI

| Piece | File | Behaviour |
|-------|------|-----------|
| Error boundary | `src/components/ErrorBoundary.tsx`, mounted in `src/app/layout.tsx` | Catches render errors below it, shows a fallback UI, reports to `errorMonitoring`. There are no per-route `error.tsx` / `global-error.tsx` files. |
| Toasts | `src/components/ui/toast.tsx` (`ToastProvider`, `useToast`) | Variants default/success/error/warning/info; auto-dismiss after 5 s unless a `duration` is passed. |
| Component pattern | pages and components | `loading` / `error` state with `try { ... } catch { setError; toast } finally { setLoading(false) }`. |

## API

Routes return JSON through helpers in `src/lib/api/utils/response.ts`:

- `success(data, message?, status = 200)` returns `{ data, message? }`.
- `error(message, status = 500, details?)` and `apiError.{badRequest 400, unauthorized 401, forbidden 403, notFound 404,
  validation 422, internal 500}` return `{ error, details? }`.

Wrappers in `src/lib/api/middleware/`:

- `withAuth(handler)` returns 401 when there is no authenticated user and converts a thrown `Response` into the response.
  Any other thrown error is logged through `logger.error` (which raises an alert when `ALERT_WEBHOOK_URL` is set) and
  becomes a 500 whose message is prefixed with `Authentication error:` and carries the error text. A thrown `Response`
  with a 5xx status is logged the same way; a thrown 4xx is not.
- `withRole(roles, handler)` returns 403 unless the caller holds one of the roles (see
  [Security-Auth-flow.md](./Security-Auth-flow.md) for the exact semantics) and converts a thrown `Response`. Any other
  thrown error is logged through `logger.error` and becomes a 500 prefixed with `Authorization error:`.
- `withSession(handler)` / `withSuperAdmin(handler)` (`routeAuth.ts`) return 401 when unauthenticated (`withSuperAdmin`
  adds a 403 unless the caller has an approved `super_admin` row), pass Next.js route params to the handler, return a
  thrown `Response` as is and turn any other error into a generic `Internal server error` 500 (details are logged only).
- `recruiterRoute(options, handler)` (`src/lib/privacy/recruiterAccess.ts`) does the same containment for recruiter routes
  (stable generic 500) and adds approval checks and a per-user rate limit.
- `withErrorHandler(handler)` catches any thrown error, logs it with `console.error` and maps it to a response by
  message pattern (`JWT`/`token` to 401, `not found` to 404, `duplicate`/`unique` to 422, anything else to 500 with
  the error message). `compose(...)` combines wrappers.

Important:

- **These wrappers are opt-in. Not every route uses them.** Of the 100 route files, `withRole` is used by 23,
  `withSuperAdmin` by 14, `withSession` by 13, `recruiterRoute` by 9, `withAuth` by 8 and `withErrorHandler` by none.
  Routes without a wrapper handle their own errors, and an uncaught exception results in Next.js's default 500 (which
  the `onRequestError` hook below reports).
- 5xx messages differ by wrapper: `withErrorHandler` (unused), `withAuth` and `withRole` include the error text,
  `withSession` and `recruiterRoute` return a generic message. New routes should prefer the generic form.
- The test `tests/security/route-inventory.test.ts` lists every route that has no recognised auth guard.

## Monitoring

Full setup and behaviour: [MONITORING.md](./MONITORING.md).

- **Alerts (optional).** With `ALERT_WEBHOOK_URL` set (https only; Slack, Discord or any JSON endpoint), `src/lib/alerts.ts`
  sends a short alert for: unhandled errors reported by Next.js through `onRequestError` (`src/instrumentation.ts`),
  every `logger.error(...)`, critical entries in `errorMonitoring` on the server, and explicit `reportError` /
  `reportEvent` calls. Alerts are throttled (the same fingerprint at most once per 5 minutes, at most 20 per 10 minutes,
  per server instance) and redacted (emails, tokens, keys and URL query strings are replaced; stacks, headers, bodies
  and cookies are never sent). Delivery is fire-and-forget; a failed delivery is dropped. Expected 4xx errors, `warn`
  and `security` log events, and errors a route catches and answers without `logger.error` are not alerted. Without the
  variable no alerts are sent.
- **Uptime probe.** `GET /api/health?deep=1` pings the database (1.5 s limit) and answers 503 when it fails; point an
  external uptime monitor at it. `GET /api/health` without `deep` never touches the database.
- `src/lib/errorMonitoring.ts` keeps the last 1000 errors **in memory** (per process), logs them to the console in
  development and installs `window` error / unhandledrejection listeners in the browser. Nothing is sent from the
  browser.
- Performance metrics in that file stay in memory / the console; there is no Sentry, tracing or dashboard, and no
  `/api/monitoring/error` route.
- Everything else is visible only in what your host captures from stdout/stderr (`console.*`, `src/lib/logger.ts`);
  alerts point to those logs, they do not replace them.

## Not implemented

- External error tracking (Sentry-style), tracing, metrics and dashboards; client-side error reporting.
- A uniform API error envelope across all routes (most use the helpers above; some return ad-hoc JSON).
- A fully shared rate limit: the Postgres-backed limiter covers only a few endpoints and needs an owner-applied
  migration (see [RATE-LIMITING.md](./RATE-LIMITING.md)).
