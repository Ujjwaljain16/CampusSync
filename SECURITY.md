# Security policy

## Reporting a vulnerability

Please do not open a public issue for security problems. Use GitHub's private vulnerability reporting
("Security" tab, "Report a vulnerability") on this repository, or contact the maintainer
([@ujjwaljain16](https://github.com/ujjwaljain16)) privately. Include the affected route or page, steps to reproduce
and the impact. Do not include real user data. You can expect an acknowledgement, but this is a small project and no
response-time SLA is offered.

## Supported versions

Only the `main` branch is maintained. There are no versioned releases.

## Early git history contains credentials: treat them as compromised

Commits early in this repository's history (notably around `2e9bc97`) contained real credentials: a Gemini API key,
the Supabase service-role key and the Verifiable Credential issuer private key. History has not been rewritten, so
anyone with a clone or fork can read them. All of them, and any other secret ever used with this project, must be
treated as compromised and rotated (see below). Credentials signed with the old issuer key should be considered
untrustworthy. CI runs gitleaks over the full history; findings from the old commits are expected until the keys
are rotated (and, optionally, the history is rewritten).

The Gemini API key and the Supabase API keys have been replaced (the Supabase legacy JWT-based keys are disabled).
The credential-signing key (`VC_ISSUER_JWK`) and the SMTP password, and any other secret ever used with the project,
should be rotated if that has not been done for your deployment.

## Key rotation

Rotate on suspicion of exposure, when someone with access leaves, and at least yearly. The full runbook (new key,
re-sign stored credentials, remove the old public key, Supabase keys checklist) is
[`my-app/docs/KEY-ROTATION.md`](my-app/docs/KEY-ROTATION.md).

### VC issuer key (`VC_ISSUER_JWK`)

Background and verification details are in
[`my-app/docs/VERIFIABLE-CREDENTIALS.md`](my-app/docs/VERIFIABLE-CREDENTIALS.md#key-rotation). A super admin can
re-sign the stored active credentials with the new key through `POST /api/admin/vcs/resign` (dry run available), after
which the old public key can be removed from `VC_ISSUER_PREVIOUS_PUBLIC_JWKS`. In short:

1. Generate a new key for the environment with `node scripts/generate-issuer-key.mjs` (run in `my-app/`; do not reuse
   any key that was ever committed). The algorithm is taken from the JWK's `alg` (EdDSA, ES256 or RS256).
2. Set `VC_ISSUER_JWK` (single-line JSON JWK including the private fields) in your host's secret store, never in git.
3. Redeploy. New credentials are signed with the new key.
4. **Routine rotation:** put the old key's *public* JWK into `VC_ISSUER_PREVIOUS_PUBLIC_JWKS` (a JSON array of public
   keys only) so credentials it signed keep verifying; re-sign the stored credentials with the tool above and then
   empty the list, or keep it listed until those credentials have expired.
   **If the old key was compromised:** do not list it. Credentials it signed then stop verifying (`unknown_key`);
   re-issue the ones that must survive, or revoke them (`verifiable_credentials.status = 'revoked'`). Listing a
   compromised key would keep anything signed with it valid.
5. Destroy the old private key everywhere (local `.env` files, password managers, CI).

### Supabase

The production project already uses the new publishable / secret API keys (migrated 2026-10-15, legacy keys disabled).
To rotate again:

1. Rotate the API keys (and the JWT signing key if needed) in the Supabase dashboard; sessions may be invalidated.
2. Update `NEXT_PUBLIC_SUPABASE_ANON_KEY` (publishable key) and `SUPABASE_SERVICE_ROLE_KEY` (secret key) in the host and
   in local `.env.local`.
3. Check the database for unexpected users, `user_roles` rows with elevated roles, and recent `audit_logs`.

### Other API keys and secrets

- `GEMINI_API_KEY`: revoke in the provider console, create a new key, update the host secret. (Any other provider key
  you may have set for local experiments should be treated the same way; the application reads only the Gemini key.)
- `SMTP_PASS`: change at the mail provider, update the host secret.
- `TRANSPARENCY_LOG_SALT` (only if the optional transparency log is enabled): it pseudonymises student ids in log
  entries; changing it makes new entries unlinkable to old ones, so rotate it deliberately.
- After rotating, redeploy and confirm the old values no longer work.

## Database security model

- The schema cleanup in `my-app/supabase/migrations/20261015_*` (steps 00 to 08) has been applied to the production
  database and the matching application code is deployed. Design, the row-level-security model and the per-step notes:
  [`my-app/docs/DATABASE-SCHEMA.md`](my-app/docs/DATABASE-SCHEMA.md); which migrations are applied: its "Migration status"
  section.
- The migration files are versioned patches, not a complete baseline dump of the original schema (which is not in the
  repository). New migrations are validated in CI on a real PostgreSQL and applied by a gated workflow, never by hand
  ([`MIGRATIONS.md`](my-app/docs/MIGRATIONS.md)); keep the applied SQL in version control.
- Authorization comes only from `user_roles`. `audit_logs` is append-only and written only by the backend; credentials
  (`verifiable_credentials`) are issued and revoked only by the backend after authorization checks.
- Certificate files: the code serves them only through short-lived (300 s) signed URLs after an authorization check
  ([`PRIVATE-STORAGE.md`](my-app/docs/PRIVATE-STORAGE.md)). The migration that makes the `certificates` bucket private
  (`20261016_01_private_certificates_bucket.sql`) is applied automatically **after** the production deployment succeeds
  ([`MIGRATIONS.md`](my-app/docs/MIGRATIONS.md)); until then the bucket is still public. Production status: "Migration status" in
  [`DATABASE-SCHEMA.md`](my-app/docs/DATABASE-SCHEMA.md).
- Specifics of individual policies are intentionally not described in this public repository.

## Security-relevant design notes

- `/api/*` is not covered by the middleware; each route authenticates itself. `my-app/tests/security/route-inventory.test.ts`
  fails CI when a route has no recognised guard and is not on its reviewed public allow-list.
- Session cookies are HttpOnly, SameSite=Lax and Secure in production, written only by the server; there is no browser
  Supabase client ([`SESSION-COOKIES.md`](my-app/docs/SESSION-COOKIES.md)). Script running on a page can still make
  same-origin requests as the user while the page is open, and the Content-Security-Policy still allows inline scripts.
- Rate limiting: an in-memory per-instance limiter on many endpoints, plus a Postgres-backed global limiter on login
  completion, signup, the email checks, OCR, public verification, the public portfolio and the SD routes. The global
  limiter needs migration `20261016_02_rate_limits.sql` (applied automatically) and fails open to the in-memory one
  ([`RATE-LIMITING.md`](my-app/docs/RATE-LIMITING.md)).
- Monitoring: an optional webhook (`ALERT_WEBHOOK_URL`) receives throttled, redacted alerts for unexpected server errors,
  and `GET /api/health?deep=1` is meant for an external uptime monitor ([`MONITORING.md`](my-app/docs/MONITORING.md)).
  There is no tracing or metrics. Treat the webhook URL as a secret.
- The service-role key bypasses RLS; it must remain server-side (a test checks it is not read in pages/components).
- Uploaded certificates are sent to Google's Gemini API for extraction.
- The revocation status list, the transparency log and SD-JWT selective disclosure are implemented but switched off by
  default, and not enabled in the production deployment.

## Automated checks

GitHub Actions run typecheck, lint, tests, a production build, the migration checks (PGlite model), a dependency audit gate (`node scripts/audit-check.mjs`: fails on high or
critical advisories in production dependencies unless listed with a reason and review date in
`my-app/audit-allowlist.json`), gitleaks (full history) and CodeQL; Dependabot proposes weekly dependency updates.
