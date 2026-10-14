-- DRAFT - review against the live schema before applying. Idempotent; runs in one transaction.
-- Part c of 3 (split so each piece fits comfortably in the Supabase SQL editor). Run after 05a: role_requests policies.
--
-- Role hierarchy mirrored from the API (src/lib/api/utils/roles.ts):
--   super_admin 100 > org_admin 80 > admin 60 > faculty 40 > recruiter 20 > student 10

begin;

-- ------------------------------------------------------------ role_requests
-- Replace ALL existing policies on role_requests with a scoped set.
do $$
declare p record;
begin
  for p in select policyname from pg_policies where schemaname = 'public' and tablename = 'role_requests' loop
    execute format('drop policy if exists %I on public.role_requests', p.policyname);
  end loop;
end $$;

alter table public.role_requests enable row level security;

create policy "role_requests: own rows" on public.role_requests
  for select to authenticated
  using (user_id = auth.uid());

create policy "role_requests: create own pending" on public.role_requests
  for insert to authenticated
  with check (user_id = auth.uid() and status = 'pending');

-- Admins of the request's organization (approved, admin or above). Requests without an organization are
-- visible to super admins only, because authz_actor_rank(null) is 100 only for an approved super_admin.
create policy "role_requests: org admins read" on public.role_requests
  for select to authenticated
  using (public.authz_actor_rank(organization_id) >= 60);

create policy "role_requests: org admins review" on public.role_requests
  for update to authenticated
  using (public.authz_actor_rank(organization_id) >= 60 and user_id <> auth.uid())
  with check (public.authz_actor_rank(organization_id) >= 60);

commit;


-- After applying, check as a NON-admin user (via the API with their JWT) that:
--   * updating another user's user_roles row is rejected;
--   * inserting a pending 'org_admin' or 'super_admin' row for yourself is rejected;
--   * the normal signup / approval flows still work (they use the service role).
--   select policyname, permissive, cmd, roles from pg_policies where schemaname='public' and tablename in ('user_roles','role_requests');
