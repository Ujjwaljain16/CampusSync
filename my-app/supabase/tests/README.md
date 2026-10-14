# Migration tests

Runs the schema-cleanup migrations (`../migrations/20261015_*.sql`) against a **model of the production database** in an
in-process PostgreSQL 18 ([PGlite](https://pglite.dev)) and asserts what they are meant to guarantee. No server, Docker or
Supabase project is needed.

```
cd my-app/supabase/tests
npm install
npm test
```

| file | purpose |
|---|---|
| `live-schema.sql` | the model: tables, columns, constraints, indexes, triggers, functions and the policies the migrations touch, plus seed rows with the same shape and counts as production (identifiers and data are synthetic) |
| `run-all.mjs` | two scenarios on fresh databases: steps 01-03, then steps 00-08 |
| `assert-expand.mjs` | behaviour of data and constraints after steps 01-03 (backfills, triggers, uniqueness, delete rules, append-only audit log, indexes) |
| `assert-final.mjs` | the final state: remaining tables / functions / columns, policy behaviour per role, that step 08 refuses to drop a table that holds data, and that the whole chain can be applied twice |

## What it does not prove

Behaviour on the real data, every real policy (only those the migrations touch are modelled), Supabase-specific machinery
(GoTrue triggers on `auth.users`, the realtime publication, storage policies) or performance at scale. Treat a green run as
"the SQL is syntactically valid and does what the design says on a faithful model"; run the migrations on a staging copy of the
real database before production.

## Keeping the model honest

If the production schema changes, re-run the introspection queries from `docs/DATABASE-SCHEMA.md` and update
`live-schema.sql` first, then the migrations. A migration that needs a new assertion should add it to the matching `assert-*.mjs`;
to check that a test can fail, weaken the migration on purpose (for example make a unique index non-unique) and confirm it is caught.
