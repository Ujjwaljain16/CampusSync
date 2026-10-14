-- DRAFT — review against the live schema before applying. Idempotent; runs in one transaction.
--
-- Row-level security for user_roles and role_requests, rebuilt on approval-aware helpers.
--
-- Reviewed against the live definitions of is_super_admin_no_rls(), is_org_admin_no_rls() and
-- get_user_org_id(). Those helpers read ONE arbitrary role row of the caller (LIMIT 1, no ORDER BY) and ignore
-- approval_status, so they are redefined here: approval-aware, deterministic, search_path pinned.
--
-- Role hierarchy mirrored from the API (src/lib/api/utils/roles.ts):
--   super_admin 100 > org_admin 80 > admin 60 > faculty 40 > recruiter 20 > student 10
--
-- Existing policy names below are the ones observed in the live database.

begin;

-- ------------------------------------------------------------------ helpers
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

-- Highest APPROVED rank the current user holds in an organization (an approved super_admin counts everywhere).
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

-- Does the current user already have ANY role row for this organization (null = platform level)?
-- A SECURITY DEFINER helper, so a user_roles policy can use it without recursing into user_roles' own RLS.
create or replace function public.authz_has_role_row(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles r
    where r.user_id = auth.uid()
      and r.organization_id is not distinct from p_org
  )
$$;

create or replace function public.authz_is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles r
    where r.user_id = auth.uid() and r.role = 'super_admin' and r.approval_status = 'approved'
  )
$$;

revoke execute on function public.authz_actor_rank(uuid)    from public, anon;
revoke execute on function public.authz_has_role_row(uuid)  from public, anon;
revoke execute on function public.authz_is_super_admin()    from public, anon;
grant  execute on function public.authz_actor_rank(uuid)    to authenticated, service_role;
grant  execute on function public.authz_has_role_row(uuid)  to authenticated, service_role;
grant  execute on function public.authz_is_super_admin()    to authenticated, service_role;

-- Redefine the existing helpers that other policies still use (same names and signatures).
create or replace function public.is_super_admin_no_rls()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return public.authz_is_super_admin();
exception when others then
  return false;
end;
$$;

create or replace function public.is_org_admin_no_rls()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return exists (
    select 1 from public.user_roles r
    where r.user_id = auth.uid()
      and r.role in ('org_admin', 'super_admin')
      and r.approval_status = 'approved'
  );
exception when others then
  return false;
end;
$$;

-- Deterministic: the organization of the caller's highest-privilege APPROVED row (oldest first on ties).
create or replace function public.get_user_org_id()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  org_id uuid;
begin
  select r.organization_id into org_id
  from public.user_roles r
  where r.user_id = auth.uid()
    and r.approval_status = 'approved'
  order by public.authz_role_rank(r.role) desc, r.created_at asc
  limit 1;
  return org_id;
exception when others then
  return null;
end;
$$;

-- ------------------------------------------------------------- user_roles
-- Guard rails that apply on top of every permissive policy (RESTRICTIVE policies are AND-ed).
drop policy if exists "Primary admins cannot be demoted via RLS bypass" on public.user_roles;
create policy "Primary admins cannot be demoted via RLS bypass" on public.user_roles
  as restrictive
  for update to authenticated
  using (is_primary_admin is not true or public.authz_is_super_admin());

drop policy if exists "Primary admins cannot be deleted via RLS bypass" on public.user_roles;
create policy "Primary admins cannot be deleted via RLS bypass" on public.user_roles
  as restrictive
  for delete to authenticated
  using (is_primary_admin is not true or public.authz_is_super_admin());

-- Organization admins (org_admin and above) manage only rows they OUTRANK, never their own row, never super_admin.
drop policy if exists "Org admins insert their org" on public.user_roles;
create policy "Org admins insert their org" on public.user_roles
  for insert to authenticated
  with check (
    organization_id is not null
    and role <> 'super_admin'
    and coalesce(is_super_admin, false) = false
    and user_id <> auth.uid()
    and public.authz_actor_rank(organization_id) >= 80
    and public.authz_role_rank(role) < public.authz_actor_rank(organization_id)
  );

drop policy if exists "Org admins update their org" on public.user_roles;
create policy "Org admins update their org" on public.user_roles
  for update to authenticated
  using (
    organization_id is not null
    and user_id <> auth.uid()
    and public.authz_actor_rank(organization_id) >= 80
    and public.authz_role_rank(role) < public.authz_actor_rank(organization_id)
  )
  with check (
    organization_id is not null
    and role <> 'super_admin'
    and coalesce(is_super_admin, false) = false
    and public.authz_actor_rank(organization_id) >= 80
    and public.authz_role_rank(role) < public.authz_actor_rank(organization_id)
  );

drop policy if exists "Org admins delete their org" on public.user_roles;
create policy "Org admins delete their org" on public.user_roles
  for delete to authenticated
  using (
    organization_id is not null
    and user_id <> auth.uid()
    and public.authz_actor_rank(organization_id) >= 80
    and public.authz_role_rank(role) < public.authz_actor_rank(organization_id)
  );

drop policy if exists "Org admins read their org" on public.user_roles;
create policy "Org admins read their org" on public.user_roles
  for select to authenticated
  using (organization_id is not null and public.authz_actor_rank(organization_id) >= 80);

-- Self-service requests: pending, low-privilege, no existing row for that organization.
drop policy if exists "Users can insert their own pending roles" on public.user_roles;
create policy "Users can insert their own pending roles" on public.user_roles
  for insert to authenticated
  with check (
    auth.uid() = user_id
    and approval_status = 'pending'
    and role in ('student', 'faculty', 'recruiter')
    and coalesce(is_super_admin, false) = false
    and coalesce(is_primary_admin, false) = false
    and not public.authz_has_role_row(organization_id)
  );

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
