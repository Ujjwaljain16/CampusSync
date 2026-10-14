# Monitoring and alerting

CampusSync needs two things to tell you when it is broken: something that **watches from outside** (is the site up and can it reach its database?) and something that **tells you about errors from inside** (an unexpected exception in a route). This page is the minimum setup for both. It costs nothing and adds no dependencies.

| Concern | How | Where it is configured |
| --- | --- | --- |
| Site down / database unreachable | External uptime monitor polling `/api/health?deep=1` | UptimeRobot, BetterStack, ... |
| Unexpected server errors | Throttled, redacted webhook alert from the app | `ALERT_WEBHOOK_URL` in Vercel |
| Log search and retention | Vercel runtime logs and log drains | Vercel dashboard |

## 1. Error alerts to Slack or Discord

1. Create an incoming webhook.
   - Slack: https://api.slack.com/messaging/webhooks (create an app, enable Incoming Webhooks, add one to a channel).
   - Discord: channel settings, Integrations, Webhooks, New Webhook, Copy Webhook URL.
2. In Vercel, open the project, Settings, Environment Variables, and add `ALERT_WEBHOOK_URL` with the webhook URL for **Production** (add it to Preview only if you want preview errors in the channel).
3. Redeploy. Environment variable changes only apply to new deployments.

The URL must start with `https://`. Anything else is ignored and no alerts are sent. Treat the URL as a secret: anyone holding it can post into your channel. Never commit it. Leaving the variable unset turns alerting off, which is the default for local development.

### What is alerted

- Unhandled errors in route handlers, server components, server actions and middleware (Next.js `onRequestError`, see `src/instrumentation.ts`). The alert carries the route pattern (for example `/api/certificates/[id]`), the router kind and the route type, plus Next's error digest as `requestId` so you can find the matching Vercel log line.
- Every `logger.error(...)` call (see `src/lib/logger.ts`), including those with no Error object.
- Critical entries in `errorMonitoring` on the server.
- Code can raise its own with `reportError(error, ctx)` or `reportEvent(name, { level, message })` from `src/lib/alerts.ts`.

### What is NOT alerted

- Expected client errors: a thrown `Response` with a 4xx status, or any error carrying a 4xx `status`. Validation failures, 401/403/404 and rate-limit responses are not incidents.
- `redirect()` and `notFound()` control flow.
- `logger.warn`, `logger.log` and `logger.security` events (login failures can be noisy; they stay in the logs).
- Errors that a route catches and turns into a 500 response without going through `logger.error`. In particular the `withAuth` / `withRole` wrappers currently log with `console.error('[withAuth] Error: ...')`, which does not reach the alert hook. A one-line follow-up (replace that `console.error` with `logger.error`) would alert on those too. Until then, a wave of such 500s is caught by the uptime monitor only if it breaks `/api/health?deep=1`; otherwise find them in the Vercel logs.
- Browser-side errors. Alerts are sent from the server only.
- Anything while the webhook is unreachable. Delivery is fire-and-forget with a 2 second timeout; a failed delivery is dropped silently.

### Noise control

Throttling is per server instance (serverless instances do not share memory, so the real ceiling is per instance, and a burst across many instances can send more):

- The same fingerprint (error name plus the first stack frame, or the route when there is no stack) is sent at most once per 5 minutes.
- At most 20 alerts per 10 minutes.
- Alerts dropped by either rule are counted; the next alert that is allowed through carries `suppressed: N` and the text "(suppressed N similar alerts since the last one)".

### What an alert contains

```json
{
  "text": "[campussync/production] ERROR TypeError at /api/certificates/[id]: Cannot read properties of undefined",
  "level": "error",
  "service": "campussync",
  "env": "production",
  "time": "2026-10-14T12:00:00.000Z",
  "route": "/api/certificates/[id]",
  "requestId": "1234567890",
  "errorName": "TypeError",
  "message": "Cannot read properties of undefined",
  "fingerprint": "9b1c2d3e",
  "routerKind": "App Router",
  "routeType": "route"
}
```

The message is redacted and cut to 500 characters: email addresses, JWTs (`eyJ...`), `Bearer` tokens, Supabase and other API keys, `password=`/`token=` style values, connection strings, long hex or base64 secrets and URL query strings are replaced with `[redacted]`. Stack traces, request headers, request bodies, cookies and the `context` object passed to `logger.error` are never sent. For Discord webhook hosts a `content` field with the same text is added, because Discord requires it.

### Test the webhook

Send a message straight to the webhook to confirm the channel works (this does not exercise the app):

```bash
curl -sS -X POST -H 'Content-Type: application/json' \
  -d '{"text":"[campussync/test] webhook test","level":"info","service":"campussync"}' \
  "$ALERT_WEBHOOK_URL"
```

Discord needs `content` instead of `text`:

```bash
curl -sS -X POST -H 'Content-Type: application/json' \
  -d '{"content":"[campussync/test] webhook test"}' "$ALERT_WEBHOOK_URL"
```

To see the app itself alert, deploy to a Preview environment that has `ALERT_WEBHOOK_URL` set and trigger any server error there. Remember the 5 minute per-fingerprint throttle if you retry.

## 2. Uptime probe

Point an external monitor at:

```
GET https://<your-domain>/api/health?deep=1
```

- Free tiers of UptimeRobot or BetterStack are enough. Use a 1 to 5 minute interval and alert after 2 consecutive failures to avoid flapping. Send the alerts to the same channel, email or phone.
- Treat any non-200 response, or a timeout over about 5 seconds, as down.
- `?deep=1` performs a database ping with a 1.5 second limit through the service-role client (it selects one row from `organizations`). It returns `200 {"status":"ok"|"degraded","healthy":true,...}` when the database answers, and `503 {"status":"degraded","healthy":false,...}` when it fails, times out or Supabase is not configured. The body never contains error text or configuration.
- `GET /api/health` without `deep` is a cheap liveness and configuration check that never touches the database. Use it for fast load balancer style checks; use `deep=1` for the uptime monitor. Both are public and responses are marked `Cache-Control: no-store`.
- Status meanings: `ok` all good; `degraded` with HTTP 200 means the site works but an optional feature is not configured (Gemini key, issuer key, SMTP); `unhealthy` (503) means Supabase is not configured at all.

Optional: also add a keyword check for `"healthy":true` so a misconfigured proxy returning a 200 error page is not mistaken for healthy.

### Configuration diagnostics

`/api/health/detailed` is for super admins and is disabled in production (it returns 404 there). In non-production environments it additionally reports, as booleans only, whether `ALERT_WEBHOOK_URL`, `GEMINI_API_KEY` and `VC_ISSUER_JWK` are configured, and the key id (`kid`) of the current issuer key. In production check the same things in the Vercel environment variable settings.

## 3. Logs and retention

Vercel keeps runtime logs only for a short period depending on the plan. For longer retention or search, enable a Log Drain (Vercel project Settings, Log Drains) to a provider of your choice (Axiom, Better Stack, Datadog, or any HTTPS endpoint), or use Vercel Observability. `logger.error` and `console.error` output goes to these logs in full (including stacks), so access to them should be limited to the team. Alerts are a pointer to the logs, not a replacement for them.

## Recommended minimum

1. `ALERT_WEBHOOK_URL` set in Production, tested with the curl above.
2. An uptime monitor on `/api/health?deep=1`, 1 to 5 minute interval, alerting a channel someone reads.
3. Vercel log drain or an agreed place to look when an alert fires (search the logs for the `requestId`/digest or the route in the alert).
4. A named person who reads the channel. An alert nobody sees is not monitoring.
