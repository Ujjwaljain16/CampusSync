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

Rotation status: the Gemini API key was rotated on 2026-10-15. Rotation of the credential-signing key is still
pending. For the Supabase keys, follow the instructions below if they have not been rotated since those commits.

## Key rotation

Rotate on suspicion of exposure, when someone with access leaves, and at least yearly.

### VC issuer key (`VC_ISSUER_JWK`)

The step-by-step runbook, including how to check the result, is in
[`my-app/docs/VERIFIABLE-CREDENTIALS.md`](my-app/docs/VERIFIABLE-CREDENTIALS.md#key-rotation). In short:

1. Generate a new key for the environment with `node scripts/generate-issuer-key.mjs` (run in `my-app/`; do not reuse
   any key that was ever committed). The algorithm is taken from the JWK's `alg` (EdDSA, ES256 or RS256).
2. Set `VC_ISSUER_JWK` (single-line JSON JWK including the private fields) in your host's secret store, never in git.
3. Redeploy. New credentials are signed with the new key.
4. **Routine rotation:** put the old key's *public* JWK into `VC_ISSUER_PREVIOUS_PUBLIC_JWKS` (a JSON array of public
   keys only) so credentials it signed keep verifying; keep it listed until those credentials have expired.
   **If the old key was compromised:** do not list it. Credentials it signed then stop verifying (`unknown_key`);
   re-issue the ones that must survive, or revoke them (`verifiable_credentials.status = 'revoked'`). Listing a
   compromised key would keep anything signed with it valid.
5. Destroy the old private key everywhere (local `.env` files, password managers, CI).

### Supabase

1. Rotate the JWT secret / API keys in the Supabase dashboard (this issues new anon and service-role keys and
   invalidates sessions).
2. Update `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` in the host and in local `.env.local`.
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
  repository). Run a migration on a staging copy first, and keep the applied SQL in version control.
- Authorization comes only from `user_roles`. `audit_logs` is append-only and written only by the backend; credentials
  (`verifiable_credentials`) are issued and revoked only by the backend after authorization checks.
- The `certificates` storage bucket is public.
- Specifics of individual policies are intentionally not described in this public repository.

## Security-relevant design notes

- `/api/*` is not covered by the middleware; each route authenticates itself. `my-app/tests/security/route-inventory.test.ts`
  fails CI when a route has no recognised guard and is not on its reviewed public allow-list.
- Session cookies are managed by `@supabase/ssr` in the browser and are not HttpOnly.
- Rate limiting is in-memory per instance.
- The service-role key bypasses RLS; it must remain server-side (a test checks it is not read in pages/components).
- Uploaded certificates are sent to Google's Gemini API for extraction.
- The revocation status list, the transparency log and SD-JWT selective disclosure are implemented but switched off by
  default, and not enabled in the production deployment.

## Automated checks

GitHub Actions run typecheck, lint, tests, a dependency audit gate (`node scripts/audit-check.mjs`: fails on high or
critical advisories in production dependencies unless listed with a reason and review date in
`my-app/audit-allowlist.json`), gitleaks (full history) and CodeQL; Dependabot proposes weekly dependency updates.
