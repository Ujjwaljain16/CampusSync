-- APPLIED to production (docs/DATABASE-SCHEMA.md, "Migration status"). Idempotent. Runs in one transaction.
-- Part a of 3 (split so each piece fits comfortably in the Supabase SQL editor). Run FIRST: approval-aware helper functions.
--
-- Role hierarchy mirrored from the API (src/lib/api/utils/roles.ts):
--   super_admin 100 > org_admin 80 > admin 60 > faculty 40 > recruiter 20 > student 10

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

commit;
