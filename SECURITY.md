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
untrustworthy. CI runs gitleaks over the full history to catch new leaks; findings from the old commits are
expected until the keys are rotated (and, optionally, the history is rewritten).

## Key rotation

Rotate on suspicion of exposure, when someone with access leaves, and at least yearly.

### VC issuer key (`VC_ISSUER_JWK`)

1. Generate a new key pair for the environment (do not reuse any key that was ever committed). The algorithm is taken
   from the JWK's `alg`; keep `kid` unique per key.
2. Set `VC_ISSUER_JWK` (single-line JSON JWK including the private fields) in your host's secret store, never in git.
   Update `NEXT_PUBLIC_ISSUER_VERIFICATION_METHOD` if the key id changed.
3. Redeploy. New credentials are signed with the new key.
4. **Existing credentials stop verifying**: verification uses the single configured key. Re-issue credentials that
   should remain valid, or revoke them (`verifiable_credentials.status = 'revoked'`). If the old key was
   compromised, assume credentials signed with it could be forged and re-issue everything after rotation.
5. Destroy the old private key everywhere (local `.env` files, password managers, CI).

### Supabase

1. Rotate the JWT secret / API keys in the Supabase dashboard (this issues new anon and service-role keys and
   invalidates sessions).
2. Update `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` in the host and in local `.env.local`.
3. Check the database for unexpected users, `user_roles` rows with elevated roles, and recent `audit_logs`.

### Other API keys and secrets

- `GEMINI_API_KEY` (and `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` if set): revoke in the provider console, create a new
  key, update the host secret.
- `SMTP_PASS`: change at the mail provider, update the host secret.
- `WEBHOOK_SECRET`: generate a new random value and update both this app and the system that signs webhooks.
- After rotating, redeploy and confirm the old values no longer work.

## Database security model (observed 2026-10-14)

- Row-Level Security is enabled on `certificates`, `profiles`, `role_requests`, `user_roles` and
  `verifiable_credentials`. The policies are not stored in this repository.
- The database policy set was reviewed and tightened by the SQL in `my-app/supabase/migrations/` (drafts: review against the live schema before applying). Specifics are intentionally not described in this public repository.
- The `certificates` storage bucket is public.
- The migration files are drafts. Review them against the live schema, apply in a transaction on a staging copy first,
  and keep the applied SQL in version control.

## Security-relevant design notes

- `/api/*` is not covered by the middleware; each route authenticates itself. `my-app/tests/security/route-inventory.test.ts`
  fails CI when a route has no recognised guard and is not on its reviewed public allow-list.
- Session cookies are managed by `@supabase/ssr` in the browser and are not HttpOnly.
- Rate limiting is in-memory per instance.
- The service-role key bypasses RLS; it must remain server-side (a test checks it is not read in pages/components).
- Uploaded certificates are sent to Google's Gemini API for extraction.

## Automated checks

GitHub Actions run typecheck, lint, tests, `npm audit --omit=dev --audit-level=high`, gitleaks (full history) and
CodeQL; Dependabot proposes weekly dependency updates.
