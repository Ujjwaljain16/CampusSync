-- DRAFT — apply only after Wave 1 is deployed, because some pages may read other
-- users' profiles with the user-session client. Candidates to verify/move to the
-- service-role client first (found by grep of `.from('profiles')`):
--   src/app/api/admin/analytics, admin/dashboard, admin/org/access-requests,
--   admin/role-requests/[id]/approve and /deny, admin/role-requests (both clients),
--   admin/faculty-approvals, api/health/detailed,
--   v2/admin/super/organizations/{admins,complete,[orgId]/admins,[orgId]/admins/add}
--   (own-profile reads - auth/me, certificates/create, app/dashboard/page.tsx,
--   profile/complete - keep working under "own profile").
--
-- Problem: the SELECT policy "Users in same org can read profiles" lets ANY member
-- of an organisation (students included) read EVERY profile row of that org
-- (email, phone, GPA, linkedin, ...) straight through PostgREST, and rows with
-- organization_id IS NULL are readable by every authenticated user. Minimising
-- data in the API layer is therefore bypassable.
--
-- Target state:
--   * every user reads their OWN profile
--   * APPROVED staff (faculty / admin / org_admin / super_admin) read the profiles of
--     their own organisation (super_admin: platform-wide)
--   * recruiters go through server routes using the service-role client with
--     explicit organisation filters (service role bypasses RLS)
--   * column-level restrictions are out of scope here
--
-- NOT touched: INSERT/UPDATE/DELETE policies. Review against the live schema
-- (policy names, helper functions) before applying. Idempotent.

begin;

-- 1. Remove the over-broad policy.
drop policy if exists "Users in same org can read profiles" on public.profiles;

-- 2. Own profile (kept / recreated).
drop policy if exists "Users can read own profile" on public.profiles;
create policy "Users can read own profile"
  on public.profiles
  for select
  to authenticated
  using (id = auth.uid());

-- 3. Existing org-admin policy, now requiring an approved role row.
drop policy if exists "Org admins can read org profiles" on public.profiles;
create policy "Org admins can read org profiles"
  on public.profiles
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.user_roles ur
      where ur.user_id = auth.uid()
        and ur.approval_status = 'approved'
        and ur.role in ('org_admin', 'admin')
        and ur.organization_id = profiles.organization_id
    )
  );

-- 4. Approved staff of the profile's organisation (faculty included).
drop policy if exists "Approved staff can read org profiles" on public.profiles;
create policy "Approved staff can read org profiles"
  on public.profiles
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.user_roles ur
      where ur.user_id = auth.uid()
        and ur.approval_status = 'approved'
        and ur.role in ('faculty', 'admin', 'org_admin')
        and ur.organization_id = profiles.organization_id
    )
  );

-- 5. Platform super admins (role row has a NULL organization_id).
drop policy if exists "Super admins can read all profiles" on public.profiles;
create policy "Super admins can read all profiles"
  on public.profiles
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.user_roles ur
      where ur.user_id = auth.uid()
        and ur.approval_status = 'approved'
        and ur.role = 'super_admin'
    )
  );

commit;

-- Rollback sketch (only if something breaks after applying):
--   create policy "Users in same org can read profiles" on public.profiles for select to authenticated
--     using (organization_id is null or organization_id in
--            (select organization_id from public.user_roles where user_id = auth.uid()));
