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
- `withRole(roles, handler)` returns 403 unless the caller holds one of the roles (see
  [Security-Auth-flow.md](./Security-Auth-flow.md) for the exact semantics) and converts a thrown `Response`.
- `withErrorHandler(handler)` catches any thrown error, logs it with `console.error` and maps it to a response by
  message pattern (`JWT`/`token` to 401, `not found` to 404, `duplicate`/`unique` to 422, anything else to 500 with
  the error message). `compose(...)` combines wrappers.

Important:

- **These wrappers are opt-in. Not every route uses them** (at the time of writing `withErrorHandler` is used by no
  route file; `withAuth` by 10 and `withRole` by 37 of the 100 route files). Routes without a wrapper handle their own
  errors, and an uncaught exception results in Next.js's default 500.
- `withErrorHandler` returns `err.message` for unknown errors; that can leak internal details to clients. Prefer a
  generic message for 5xx responses.
- The test `tests/security/route-inventory.test.ts` lists every route that has no recognised auth guard.

## Monitoring

- `src/lib/errorMonitoring.ts` keeps the last 1000 errors **in memory** (per process), logs them to the console in
  development and installs `window` error / unhandledrejection listeners in the browser.
- The "send to external service" and performance-analytics hooks in that file are **placeholders**: no Sentry, no
  alerting and no email for critical errors are configured. There is no `/api/monitoring/error` route.
- Production visibility today is whatever your host captures from stdout/stderr (`console.*`, `src/lib/logger.ts`).

## Not implemented

- External error tracking and alerting.
- A uniform API error envelope across all routes (most use the helpers above; some return ad-hoc JSON).
- Distributed rate limiting (see the README's known limitations).
