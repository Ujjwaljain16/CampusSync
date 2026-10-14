# Database access flow

How API routes reach Postgres. There are two kinds of Supabase client, and they behave very differently with respect
to Row-Level Security (RLS).

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

1. **Authenticate first** (`withAuth`, `withRole`, or `supabase.auth.getUser()`); `/api/*` is not covered by middleware.
2. **Resolve the organization** for multi-tenant data with `getOrganizationContext(user, requestedOrgId)` and filter
   by `organization_id` (`getTargetOrganizationIds(context)` returns the list; recruiters may have several).
3. **User-bound client** (`createSupabaseServerClient`): queries run as the signed-in user, so RLS policies are the
   second line of defence.
4. **Admin client** (35 route files): used for operations that RLS would block (creating users, role changes,
   cross-organization admin views, storage cleanup, audit writes). Nothing but the route's own checks protects these
   queries, so each such route must verify the caller's role and the target's organization itself.
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

RLS is enabled in production on `certificates`, `profiles`, `role_requests`, `user_roles` and
`verifiable_credentials`. The policies themselves are not stored in this repository, so this document does not
list or count them. The hardening drafts live in `supabase/migrations/` and must be reviewed against the live schema
before they are applied. Other tables referenced by the code may have no RLS at all; check with
`select relname, relrowsecurity from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r';`.

## Tables the code touches

See the list in [ARCHITECTURE.md](./ARCHITECTURE.md#data-stores). `revocation_list` is referenced by two routes but
does not exist in production.
