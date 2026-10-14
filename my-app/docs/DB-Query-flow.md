# Database access flow

How API routes reach Postgres. There are two kinds of Supabase client, and they behave very differently with respect
to Row-Level Security (RLS). Both are created on the server: the browser has no Supabase client and never queries the
database (or storage) directly; it only calls `/api/*` with its HttpOnly session cookies.

```mermaid
graph TB
    UI[React component] -->|fetch /api/...| Route[Route handler]
    Route -->|1. authenticate| Guard["withAuth / withRole / auth.getUser()"]
    Route -->|2. resolve organization| Ctx[getOrganizationContext / getRecruiterContext]
    Route -->|3a. user-bound client: createSupabaseServerClient| UC[Supabase client with the user's JWT]
    Route -->|3b. admin client: createSupabaseAdminClient / service-role key| AC[Supabase client with the service-role key]
    UC -->|RLS policies apply| DB[(Postgres)]
    AC -->|RLS bypassed| DB
```

## Rules of thumb used in the code

1. **Authenticate first** (`withAuth`, `withRole`, `withSession`, `withSuperAdmin`, `recruiterRoute`, or
   `supabase.auth.getUser()`); `/api/*` is not covered by middleware.
2. **Resolve the organization** for multi-tenant data with `getOrganizationContext(user, requestedOrgId)` (or check an
   approved role in a given organization with `authorizeOrg`) and filter by `organization_id`
   (`getTargetOrganizationIds(context)` returns the list; recruiters may have several).
3. **User-bound client** (`createSupabaseServerClient`): queries run as the signed-in user, so RLS policies are the
   second line of defence.
4. **Admin client** (44 route files call `createSupabaseAdminClient()`; shared helpers such as `writeAudit`,
   `recruiterRoute` and the global rate limiter use it too): used for operations that RLS would block (creating users,
   role changes, cross-organization admin views, storage cleanup, signed URLs for certificate files, credential
   issue/revoke/re-sign, audit writes, rate-limit counters). Nothing but the route's own
   checks protects these queries, so each such route must verify the caller's role and the target's organization itself.
5. Prefer small, explicit `select(...)` column lists over `select('*')` for responses that reach other users.

## Query example (organization-scoped list)

```ts
export const GET = withRole(['faculty', 'admin', 'org_admin', 'super_admin'], async (req, { user }) => {
  const ctx = await getOrganizationContext(user, req.headers.get('X-Organization-ID'));
  const orgIds = getTargetOrganizationIds(ctx);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('certificates')
    .select('id, title, institution, verification_status, student_id')
    .in('organization_id', orgIds);
  ...
});
```

## What RLS covers

The schema cleanup (`supabase/migrations/20261015_*`) is applied in production; the policy model per table is in
[DATABASE-SCHEMA.md](./DATABASE-SCHEMA.md) (section 6), and its "Migration status" section lists which migrations are
applied. The migrations are versioned patches, not a complete baseline dump of the original schema, so only the
policies they create or rewrite are in this repository, and this document does not list or count policies. To check
which tables have RLS enabled in a given database:
`select relname, relrowsecurity from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r';`.

## Tables the code touches

See the list in [ARCHITECTURE.md](./ARCHITECTURE.md#data-stores). There is no `revocation_list` table: revocation
state lives on `verifiable_credentials`.

The one table the application does not query with `.from()` is `public.rate_limits` (migration
`20261016_02_rate_limits.sql`): the global rate limiter calls the `rate_limit_hit` function through the service-role
client, and nothing else reads or writes the table. It is created by an owner-applied migration; until then the limiter
fails open to the in-memory one. See [RATE-LIMITING.md](./RATE-LIMITING.md) and the "Migration status" section of
[DATABASE-SCHEMA.md](./DATABASE-SCHEMA.md).

Storage is reached the same way: uploads use the student's own session (owner-folder policy), reads of certificate files
go through a signed URL that the server creates with the service-role client after an authorization check
([PRIVATE-STORAGE.md](./PRIVATE-STORAGE.md)).
