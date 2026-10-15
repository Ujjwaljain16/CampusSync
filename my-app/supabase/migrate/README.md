# Migration runner

`migrate.mjs` applies the SQL files in `../migrations/` to a PostgreSQL database. Node built-ins and the `psql` client only
(no `npm install`). Full documentation, conventions and the one-time setup: [`docs/MIGRATIONS.md`](../../docs/MIGRATIONS.md).

```
export DATABASE_URL=postgresql://...          # the only way to pass the connection string; it is never printed
node migrate.mjs plan   [--phase pre|post|all] [--replay-baseline]
node migrate.mjs status
node migrate.mjs init                          # once: create public.app_schema_migrations, record the baseline files
node migrate.mjs apply  [--phase pre|post|all] [--replay-baseline] [--allow-drift]
```

First line of a migration file (within the first 5 lines): `-- migrate: baseline | skip | phase=post`; no directive means
a normal `pre` migration. Exit codes: 0 ok, 1 failure, 2 drift (a recorded file was edited).

| file | purpose |
|---|---|
| `migrate.mjs` | the runner; exports `parseDirective`, `classify`, `checksum`, `computePlan` for the tests |
| `ci-storage-stub.sql` | CI only: a minimal `storage` schema so the bucket migration can be replayed on a plain PostgreSQL |

Tests: `my-app/tests/ops/migrate.test.ts` (psql is stubbed). Real PostgreSQL: the CI job "Migration runner (real Postgres)".
