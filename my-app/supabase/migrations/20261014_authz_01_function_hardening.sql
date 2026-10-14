-- DRAFT — review against live schema before applying
--
-- Function hardening.
--
-- Restricts who may execute ensure_role and makes it safe by construction.
--
-- Fix:
--   1. only service_role may execute it (the application no longer calls it at
--      all: role rows are inserted directly with the service-role client);
--   2. redefine it so that, even for service_role, it is safe by construction:
--        - refuses 'admin' / 'org_admin' / 'super_admin'
--        - is organization-aware (UNIQUE NULLS NOT DISTINCT (user_id, organization_id))
--        - always creates the row as 'pending' (an admin approves it)
--
-- Idempotent: CREATE OR REPLACE + REVOKE/GRANT can be re-run.
-- Assumes (from live DB): user_roles(user_id, role, organization_id,
-- approval_status, assigned_by, created_at, updated_at) with CHECK on role and
-- approval_status IN ('pending','approved','denied').

begin;

-- 1. Redefine the existing 2-argument signature (platform-level / NULL organization)
create or replace function public.ensure_role(p_user_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.ensure_role(p_user_id, p_role, null::uuid);
end;
$$;

-- 2. Organization-aware variant (new, optional 3rd argument)
create or replace function public.ensure_role(p_user_id uuid, p_role text, p_organization_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_role is null or p_role not in ('student', 'faculty', 'recruiter') then
    raise exception 'ensure_role: role % cannot be granted through this function', p_role
      using errcode = '42501';
  end if;

  -- Never overwrite an existing row for the same (user, organization):
  -- UNIQUE NULLS NOT DISTINCT (user_id, organization_id) makes this race-safe.
  insert into public.user_roles (user_id, role, organization_id, approval_status, assigned_by, created_at, updated_at)
  values (p_user_id, p_role, p_organization_id, 'pending', null, now(), now())
  on conflict (user_id, organization_id) do nothing;
end;
$$;

-- 3. Lock both signatures down to the service role
revoke execute on function public.ensure_role(uuid, text) from public, anon, authenticated;
revoke execute on function public.ensure_role(uuid, text, uuid) from public, anon, authenticated;
grant  execute on function public.ensure_role(uuid, text) to service_role;
grant  execute on function public.ensure_role(uuid, text, uuid) to service_role;

commit;
