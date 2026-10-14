-- DRAFT — review against live schema before applying
--
-- RLS hardening for user_roles and role_requests.
--
-- Tightens the user_roles and role_requests policies (specifics intentionally not described here).
--
-- NEEDS REVIEW against the bodies of is_org_admin_no_rls(), is_super_admin_no_rls()
-- and get_user_org_id(), which were not available when this was written. Instead
-- of depending on them for the new policies this file defines its own
-- SECURITY DEFINER helper (RLS-free, approval-aware, search_path pinned).
-- The existing policy names for UPDATE/DELETE are GUESSES - run
--   select policyname, cmd from pg_policies where tablename in ('user_roles','role_requests');
-- first and adjust the DROP POLICY lines. The super-admin policies are left untouched.
--
-- Role hierarchy mirrored from the API (src/lib/api/utils/roles.ts):
--   super_admin 100 > org_admin 80 > admin 60 > faculty 40 > recruiter 20 > student 10

begin;

-- ---------------------------------------------------------------- helpers
create or replace function public.authz_role_rank(p_role text)
returns int
language sql
immutable
set search_path = public
as $$
  select case p_role
    when 'super_admin' then 100
    when 'org_admin'   then 80
    when 'admin'       then 60
    when 'faculty'     then 40
    when 'recruiter'   then 20
    when 'student'     then 10
    else 0
  end
$$;

-- Highest APPROVED rank the current user holds in an organization
-- (an approved super_admin row counts as 100 everywhere).
create or replace function public.authz_actor_rank(p_org uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(max(
           case when r.role = 'super_admin' then 100
                when r.organization_id is not distinct from p_org then public.authz_role_rank(r.role)
                else 0 end
         ), 0)
  from public.user_roles r
  where r.user_id = auth.uid()
    and r.approval_status = 'approved'
$$;

revoke execute on function public.authz_actor_rank(uuid) from public, anon;
grant  execute on function public.authz_actor_rank(uuid) to authenticated, service_role;

-- ------------------------------------------------------------- user_roles
-- (a) org admins: may only manage rows they OUTRANK, never their own row, never super_admin
drop policy if exists "Org admins insert their org" on public.user_roles;
create policy "Org admins insert their org" on public.user_roles
  for insert to authenticated
  with check (
    organization_id is not null
    and role <> 'super_admin'
    and user_id <> auth.uid()
    and public.authz_actor_rank(organization_id) >= 60
    and public.authz_role_rank(role) < public.authz_actor_rank(organization_id)
    -- only roles the actor may approve are created as approved
    and (approval_status = 'pending' or public.authz_role_rank(role) < public.authz_actor_rank(organization_id))
  );

drop policy if exists "Org admins update their org" on public.user_roles;
create policy "Org admins update their org" on public.user_roles
  for update to authenticated
  using (
    organization_id is not null
    and user_id <> auth.uid()
    and public.authz_actor_rank(organization_id) >= 60
    and public.authz_role_rank(role) < public.authz_actor_rank(organization_id)
  )
  with check (
    organization_id is not null
    and role <> 'super_admin'
    and public.authz_actor_rank(organization_id) >= 60
    and public.authz_role_rank(role) < public.authz_actor_rank(organization_id)
  );

drop policy if exists "Org admins delete their org" on public.user_roles;
create policy "Org admins delete their org" on public.user_roles
  for delete to authenticated
  using (
    organization_id is not null
    and user_id <> auth.uid()
    and public.authz_actor_rank(organization_id) >= 60
    and public.authz_role_rank(role) < public.authz_actor_rank(organization_id)
  );

-- (b) self-service pending requests: pending, low-privilege, and no row yet for that organization
drop policy if exists "Users can insert their own pending roles" on public.user_roles;
create policy "Users can insert their own pending roles" on public.user_roles
  for insert to authenticated
  with check (
    auth.uid() = user_id
    and approval_status = 'pending'
    and role in ('student', 'faculty', 'recruiter')
    and not exists (
      select 1 from public.user_roles x
      where x.user_id = auth.uid()
        and x.organization_id is not distinct from user_roles.organization_id
    )
  );
-- NOTE: the subquery above reads user_roles from inside a user_roles policy; if that
-- raises "infinite recursion detected in policy", move the NOT EXISTS into a
-- SECURITY DEFINER helper like authz_actor_rank().

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

-- admins of the request's organization (approved, admin or above); super admin via rank 100.
-- Requests without an organization (organization_id is null) are visible to super admins only
-- because authz_actor_rank(null) is 100 only for super_admin.
create policy "role_requests: org admins read" on public.role_requests
  for select to authenticated
  using (public.authz_actor_rank(organization_id) >= 60);

create policy "role_requests: org admins review" on public.role_requests
  for update to authenticated
  using (public.authz_actor_rank(organization_id) >= 60 and user_id <> auth.uid())
  with check (public.authz_actor_rank(organization_id) >= 60);

commit;
