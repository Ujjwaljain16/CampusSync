# Scripts

Utility scripts for operating and checking a CampusSync deployment. Run them from `my-app/`. `setup-superadmin.mjs`
uses the Supabase **service-role** key, which bypasses Row-Level Security: run it only from a trusted machine and never
commit credentials.

| Script | Purpose | Needs |
|---|---|---|
| `setup-superadmin.mjs` | create the first `super_admin` (or upgrade a user) | Supabase URL, anon key and service-role key |
| `generate-issuer-key.mjs` | print a new credential-signing key and its public JWK | nothing (writes nothing to disk) |
| `audit-check.mjs` | dependency audit gate used by CI | network (`npm audit`) |
| `sync-verifier.mjs` | copy the offline verifier into the app | nothing |
| `bench-merkle.mjs`, `bench-sdjwt.mjs`, `bench-verify.mjs` | in-memory micro-benchmarks | Node (see below) |

## `setup-superadmin.mjs`

Creates the first `super_admin` user, or upgrades an existing user to `super_admin`.

```bash
cd my-app
# The script reads the process environment and does NOT load .env.local itself.
# Node >= 20.6 can load it for you:
node --env-file=.env.local scripts/setup-superadmin.mjs
# or: npm run admin:setup   (with the variables already exported in your shell)
```

Required environment variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`.

It prompts for email and, for a new user, password (min 12 chars with an uppercase letter, a lowercase letter and a
digit), full name and optional phone, then (via the admin client):

- creates (or finds) the Supabase Auth user (a new user is created with the email already confirmed);
- upserts the `profiles` row (a new user), or clears `profiles.organization_id` (an upgraded user);
- writes the `user_roles` row with role `super_admin`, `organization_id` NULL and `approval_status = 'approved'`: it
  updates the user's existing platform-level row, converts the user's only organization-bound row, or inserts a new one;
- writes an `audit_logs` entry in the canonical shape (`superadmin_created` / `superadmin_upgraded`, target type `user`);
  a failed audit insert is only a warning.

Notes:

- Existing users: if the email already exists the script offers to upgrade that user. The password is not changed.
- A super admin can act across all organizations through the application's API routes (they check the role),
  and, because of how the service-role key is used by those routes, across all data.
- The script requires the tables `profiles`, `user_roles` and `audit_logs`. The schema design is in
  [`../docs/DATABASE-SCHEMA.md`](../docs/DATABASE-SCHEMA.md); `../supabase/migrations/` holds versioned SQL patches (not a
  complete baseline dump of the original schema).
- Use a different super admin per environment and rotate/remove accounts you no longer need.

## `generate-issuer-key.mjs`

```bash
node scripts/generate-issuer-key.mjs
```

Generates a new Ed25519 credential-signing key. It prints a `VC_ISSUER_JWK=...` line (contains the PRIVATE key: store it
only in the host's secret store or an untracked `.env.local`) and the matching public JWK; the `kid` is the RFC 7638
thumbprint. Rotation steps: [`../docs/VERIFIABLE-CREDENTIALS.md`](../docs/VERIFIABLE-CREDENTIALS.md). (The code also
accepts ES256 and RS256 keys.)

## `audit-check.mjs`

```bash
npm run audit:prod        # = node scripts/audit-check.mjs [--level=high|critical]
```

Runs `npm audit --omit=dev --json` and fails on any high or critical advisory that is not listed, with a reason and a
review-by date, in `audit-allowlist.json`. An expired entry stops being honoured. This is the "Dependency audit" job in
CI. Needs network access.

## `sync-verifier.mjs`

```bash
node scripts/sync-verifier.mjs
```

Copies `../verifier/src/verify.mjs` and `verify.d.mts` into `src/lib/offlineVerify/` so the `/verify` page can bundle the
verifier. A test (`tests/verifier/vendoredCopy.test.ts`) fails when the copies differ; re-run the script after changing
the verifier.

## Benchmarks

Machine-specific timings of in-memory work (no database, no network); not a statement about end-to-end latency.

- `node scripts/bench-merkle.mjs [leaves]`: Merkle tree and proofs (`src/lib/merkle.ts`), default 100000 leaves.
- `node scripts/bench-sdjwt.mjs [iterations]`: SD-JWT issue / present / verify; needs Node >= 22.18 (runs the TypeScript
  source directly).
- `node scripts/bench-verify.mjs [--n 1000]`: offline credential verification with and without a status-list check.

## Troubleshooting

- "Missing required environment variables": export the variables above or use `node --env-file=.env.local`.
- "Failed to create auth user": the email may already exist, the service-role key may be wrong, or the project may be paused.
- "Failed to create profile / role": a required table is missing or a constraint failed (for example the
  `user_roles` role/approval checks); read the printed Supabase error.
- For the policy model see [`../docs/DATABASE-SCHEMA.md`](../docs/DATABASE-SCHEMA.md) (section 6) and
  [`../docs/Security-Auth-flow.md`](../docs/Security-Auth-flow.md).
