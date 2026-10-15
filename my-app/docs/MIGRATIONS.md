# Database migrations

SQL files in `my-app/supabase/migrations/` are applied to the production database **automatically**, in a defined order
relative to the code deploy, behind an approval gate the maintainer can switch on, and every new file is validated on a
real PostgreSQL before it can be merged. Nobody applies SQL by hand.

Parts: the runner [`supabase/migrate/migrate.mjs`](../supabase/migrate/README.md) (Node built-ins and the `psql` client, no
dependencies), the workflow `.github/workflows/migrate.yml` ("Apply database migrations"), and the CI job
"Migration runner (real Postgres)" in `.github/workflows/ci.yml`.

## How it works

```
 pull request ──► CI: "Migration runner (real Postgres)"
                    loads the schema model into a postgres:17 container, then replays EVERY file with the same runner
                    (init, apply --replay-baseline, plan must be empty). A broken file fails the PR.
      │
   merge to main
      │
      ├──► workflow "Apply database migrations", job `pre`      (only when files under supabase/migrations or
      │      [approval gate: environment production-db]          supabase/migrate changed)
      │      applies pending files WITHOUT a directive  ─────►  expand / additive changes, before or with the deploy
      │
      └──► Vercel deploys main to Production
             │  deployment succeeded
             ▼
           job `post`  (only if the deployed commit changed migration files)
             [approval gate: environment production-db]
             applies pending files marked `-- migrate: phase=post`  ─►  contract / tighten changes that need the new code live
```

The runner keeps a ledger in the table `public.app_schema_migrations` (file name, SHA-256 checksum, phase, kind, time).
A file already in the ledger is never run again. Files run in file name order; `pre` files before `post` files. The first
failure stops the run and later files stay pending. Row level security is enabled on the ledger with no policies and no
privileges for `anon` / `authenticated`; only the database owner (the connection string below) and the service role can
touch it.

## Directives

The first five lines of a migration file may contain one comment line `-- migrate: <directive>`. An unknown directive, two
directives, or a directive after line 5 makes the runner (and CI) fail, so a typo cannot silently change what runs.

| directive | meaning | used for |
|---|---|---|
| (none) | normal migration, phase **pre**: runs before or with the deploy | additive changes (new table, new nullable column, new index, new function) |
| `phase=post` | runs only **after** the production deployment succeeded | changes that break the old code or need the new code live (make a bucket private, drop a column, add `NOT NULL`, tighten a policy) |
| `baseline` | already applied in production; recorded as applied by `init`, never executed by `apply` | the history up to `20261015_08` |
| `skip` | never executed or recorded | notes, superseded files, optional modules that are off, files on hold, read-only checks |

Currently: 21 files are `baseline`, 10 are `skip` (including `20261014_privacy_profiles_rls`, on hold: remove its `skip`
line when it is time to apply it, and decide its phase then), `20261016_02_rate_limits` is `pre`, and
`20261016_01_private_certificates_bucket` is `phase=post`. The test `tests/ops/migrate.test.ts` pins this classification.

## Writing a migration (conventions)

- **Name**: `YYYYMMDD_NN_short_name.sql`; order is plain lexical file name order. Plain ASCII only.
- **One transaction per file** (`begin; ... commit;`), so a failure leaves nothing half applied. Do not use statements that
  cannot run in a transaction (for example `create index concurrently`) in the same file as other changes.
- **Idempotent**: `if not exists`, `create or replace`, `drop ... if exists`. The runner does not re-run recorded files, but
  a failed run is retried from the failing file.
- **Expand before code, contract after code.** If old code keeps working with the change, leave the file without a directive
  (it runs before or with the deploy). If the change would break the old code, or only makes sense once the new code is
  live, put `-- migrate: phase=post` on the first line. When one feature needs both, use two files: an additive one now
  and a `phase=post` one for the tightening.
- **Never edit a file that has been applied**; add a new one. The runner stores a checksum and refuses to run (exit code 2,
  "drift") when a recorded file changed, even by a comment. Line endings do not matter (CRLF is normalised).
- **Destructive steps are guarded**, as in `20261015_08_contract.sql`: refuse to drop a table that holds data, check
  that a column is all NULL before dropping it, rewrite dependent policies first.
- **Forward fixes only.** There is no automatic rollback. Write a new migration that corrects a bad one.
- Do not put secrets or personal data in a migration file; the repository is public.
- The CI model (`supabase/tests/live-schema.sql`, plus a small storage stand-in) only knows the objects it declares. If a
  new migration needs another table or schema from production to be replayed, extend the model first (see
  `supabase/tests/README.md`).

## One-time setup (the maintainer does this once)

1. **GitHub environment.** Repository Settings, Environments, New environment, name `production-db`. To get a manual
   approval step, tick "Required reviewers" and add yourself. With reviewers set, every run of the workflow waits for
   your approval before it can read the secret or reach the database. Without reviewers, runs go straight through.
2. **Secret `SUPABASE_DB_URL`** on that environment (Environment secrets, not a repository secret, so only jobs that pass
   the gate can read it). Value: the Supabase **session pooler** connection string. In the Supabase dashboard: Project,
   Connect (or Settings, Database), Connection string, "Session pooler". Use the pooler, not the direct host: GitHub's
   runners are IPv4-only and the direct database host is IPv6-only on current projects. Replace the password placeholder
   with the database password (Settings, Database, reset password if unknown). The connection must be allowed to create
   tables and run DDL (the default `postgres` user is).
3. **Initialise once.** Actions, "Apply database migrations", Run workflow, mode `init`. This creates the ledger table and
   records the baseline files as applied without running them. Safe to run again.
4. **Check.** Run it again with mode `plan` (phase `all`). It must list exactly the two `20261016_` files: `pre`
   `20261016_02_rate_limits` and `post` `20261016_01_private_certificates_bucket`. If it lists anything else, stop and
   read the Troubleshooting section.
5. Optional: protect `main` so that the check "Migration runner (real Postgres)" is required before merging.

If the secret is missing, the workflow fails on purpose with a message that points here; it never skips silently. The first
runs after the runner is merged fail until steps 1 to 3 are done; that is expected. After setup, run mode `plan`, then
mode `apply` (phase `pre`; `post` follows by itself after the next production deployment, or run it manually).

## The two migrations pending today

- `20261016_02_rate_limits.sql` (phase `pre`): additive (table and function for the global rate limiter). It is applied by
  the `pre` job when the migration runner itself is merged to `main` (the push touches `supabase/migrate`), or on demand
  with mode `apply`, phase `pre`. The code works with or without it (it fails open), see
  [RATE-LIMITING.md](./RATE-LIMITING.md).
- `20261016_01_private_certificates_bucket.sql` (phase `post`): makes the `certificates` bucket private. It is applied by
  the `post` job after a production deployment succeeds **and** the deployed commit changed migration files. The commit
  that adds this runner changes migration files (the directive lines), so the next successful production deployment of that
  commit triggers it. If you prefer to choose the moment, leave the approval gate on and approve the `post` job only after
  checking the signed-URL flow ([PRIVATE-STORAGE.md](./PRIVATE-STORAGE.md)), or run it manually (mode `apply`, phase `post`).

The `post` runner refuses to run while any `pre` file is still pending, so a failed `pre` run can never be followed by a
`post` change.

## Using the runner by hand (local, for the maintainer or CI)

```
DATABASE_URL=... node my-app/supabase/migrate/migrate.mjs plan      # what is pending, no changes
DATABASE_URL=... node my-app/supabase/migrate/migrate.mjs status    # every file and its state
```

The connection string is read only from `DATABASE_URL` and is masked in all output. States: `applied`, `baseline`,
`skipped`, `pending-pre`, `pending-post`, `modified` (edited after it was recorded). `apply` options: `--phase pre|post|all`,
`--allow-drift` (continue although a recorded file was edited; only for a deliberate comment-only change),
`--replay-baseline` (CI only, refuses to run unless `CI=true`).

## Rollback policy

Forward fixes: a migration that turns out wrong is corrected by a new migration file. Restoring from a backup is a
separate, manual decision. The one pre-approved emergency statement is the private-bucket rollback documented in
[PRIVATE-STORAGE.md](./PRIVATE-STORAGE.md) (it restores public access, so use it only temporarily); after running it,
add a new migration so the ledger and the database agree again.

## What stays manual

- Creating the GitHub environment, the reviewers and the secret `SUPABASE_DB_URL`; rotating the database password and
  updating the secret.
- Approving the gate (when reviewers are required) and reading the run summary.
- Any restore from backup, and any change that cannot be expressed as a forward migration.

## Troubleshooting

- **"DRIFT: <file> was edited after it was applied" (exit 2).** Someone changed a recorded file. Restore the original
  content (`git log -p` for the file) and put the change in a new migration. Use `--allow-drift` only for a harmless edit
  such as a comment, and then update the ledger knowingly.
- **"The tracking table ... does not exist. Run init once".** Run the workflow with mode `init` (setup step 3).
- **"The secret SUPABASE_DB_URL is not set".** Setup step 2; check that the secret is on the environment `production-db`.
- **Connection errors (timeout, "Network is unreachable", "password authentication failed", "Tenant or user not found").**
  Use the session pooler string, not the direct host (IPv4). The user name of a pooler string looks like
  `postgres.<project-ref>`. Re-copy the string after a password reset. Do not use the transaction pooler (port 6543) for
  migrations: session-level behaviour is not guaranteed there.
- **A migration failed.** The run summary shows the file; the log of the Apply step shows psql's one-line error (detail
  lines are suppressed on purpose, because they can quote row values and the logs of a public repository are public;
  set `MIGRATE_PSQL_VERBOSITY=default` only on a private terminal). Later files were not run. Because each file is one
  transaction, nothing from the failed file was applied. Fix forward with a new file (or, if the failed file never ran
  successfully anywhere, correct it in place: it is not in the ledger yet), merge, and the next run continues.
- **`post` did not run.** It runs only for a successful Production deployment whose commit changed migration files. If
  several merges were deployed together, or a run was cancelled (GitHub keeps only one waiting run per concurrency group),
  start the workflow manually with mode `plan`, then `apply`, phase `post`.
- **`post` refused: "pre migration(s) are still pending".** Run phase `pre` first (mode `apply`, phase `pre`), then `post`.
