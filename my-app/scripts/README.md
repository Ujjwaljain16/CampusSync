# Administration scripts

Utility scripts for operating a CampusSync deployment. Both use the Supabase **service-role** key, which bypasses
Row-Level Security. Run them only from a trusted machine and never commit credentials.

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

It prompts for email, password (min 8 chars), full name and optional phone, then (via the admin client):

- creates (or finds) the Supabase Auth user;
- writes a `profiles` row and a `user_roles` row with role `super_admin`;
- writes an `audit_logs` entry (`superadmin_created` / `superadmin_upgraded`, target type `user`); a failed audit
  insert is only a warning.

Notes:

- Existing users: if the email already exists the script offers to upgrade that user. The password is not changed.
- A super admin can act across all organizations through the application's API routes (they check the role),
  and, because of how the service-role key is used by those routes, across all data.
- The script requires the tables `profiles`, `user_roles` and `audit_logs` to exist (it no longer uses `super_admin_audit`
  or `profiles.role`). The schema is not
  in this repository; see `supabase/migrations/` for the draft/lockdown SQL that does exist.
- Use a different super admin per environment and rotate/remove accounts you no longer need.

## `db-audit.js`

Read-only integrity report (row counts, users with multiple roles, orphaned `user_roles`, organizations whose
`primary_admin_id` does not match).

```bash
node scripts/db-audit.js   # loads my-app/.env.local itself via dotenv
```

Limitations: its column-existence check parses a `supabase-migrations/` folder that is not in this repository, so
that part reports nothing useful. This script may be reworked or removed; check `git log` for its current state.

## Troubleshooting

- "Missing required environment variables": export the variables above or use `node --env-file=.env.local`.
- "Failed to create auth user": the email may already exist, the service-role key may be wrong, or the project may be paused.
- "Failed to create profile / role": a required table is missing or a constraint failed (for example the
  `user_roles` role/approval checks); read the printed Supabase error.
- RLS policies are not in this repo. For the policy set observed in production and its known weaknesses see
  [`../docs/Security-Auth-flow.md`](../docs/Security-Auth-flow.md) and `../supabase/migrations/`.
