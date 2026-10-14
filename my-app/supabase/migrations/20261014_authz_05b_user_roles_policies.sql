-- DRAFT — review against the live schema before applying. Idempotent; runs in one transaction.
-- Part b of 3 (split so each piece fits comfortably in the Supabase SQL editor). Run after 05a: user_roles policies.
--
-- Role hierarchy mirrored from the API (src/lib/api/utils/roles.ts):
--   super_admin 100 > org_admin 80 > admin 60 > faculty 40 > recruiter 20 > student 10

begin;

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

commit;
