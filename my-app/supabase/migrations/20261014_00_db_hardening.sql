-- migrate: baseline
-- Database hardening. APPLIED to production (docs/DATABASE-SCHEMA.md, "Migration status"). Idempotent.
-- Idempotent. Run in the Supabase SQL editor.
--
-- Contents: restrict EXECUTE on a SECURITY DEFINER helper to the service role; tighten the INSERT/UPDATE
-- policies on certificates and verifiable_credentials so that review state can only be changed by approved
-- reviewers of the owning organization.

begin;

-- 1) restrict who may execute ensure_role(uuid, text); the application no longer calls it.
revoke execute on function public.ensure_role(uuid, text) from public, anon, authenticated;
grant  execute on function public.ensure_role(uuid, text) to service_role;

-- 2) certificates: owners do not update review state themselves.
drop policy if exists "Students can update own certificates in org" on public.certificates;

-- 3) certificates: new rows always start as pending, with an approved membership.
drop policy if exists "Students can insert own certificates in org" on public.certificates;
create policy "Students can insert own certificates in org" on public.certificates
  for insert to authenticated
  with check (
    student_id = auth.uid()
    and coalesce(verification_status, 'pending') = 'pending'
    and coalesce(status, 'pending') = 'pending'
    and organization_id in (
      select ur.organization_id from public.user_roles ur
      where ur.user_id = auth.uid() and ur.approval_status = 'approved'
    )
  );

-- 4) certificates: staff updates require an approved role and a matching WITH CHECK.
drop policy if exists "Org staff can update org certificates" on public.certificates;
create policy "Org staff can update org certificates" on public.certificates
  for update to authenticated
  using (
    organization_id in (
      select ur.organization_id from public.user_roles ur
      where ur.user_id = auth.uid()
        and ur.role in ('admin', 'faculty', 'org_admin')
        and ur.approval_status = 'approved'
    )
  )
  with check (
    organization_id in (
      select ur.organization_id from public.user_roles ur
      where ur.user_id = auth.uid()
        and ur.role in ('admin', 'faculty', 'org_admin')
        and ur.approval_status = 'approved'
    )
  );

-- 5) verifiable_credentials: updates (e.g. revocation) by approved staff of the owner's organization only.
drop policy if exists users_update_own_vcs on public.verifiable_credentials;
drop policy if exists vcs_update_staff on public.verifiable_credentials;
create policy vcs_update_staff on public.verifiable_credentials
  for update to authenticated
  using (
    exists (
      select 1
      from public.user_roles ur
      join public.profiles p on p.id = verifiable_credentials.student_id
      where ur.user_id = auth.uid()
        and ur.approval_status = 'approved'
        and (ur.role = 'super_admin'
             or (ur.role in ('faculty', 'admin', 'org_admin') and ur.organization_id = p.organization_id))
    )
  );

commit;

-- Read-only follow-ups (run separately and review the results):
--   select id, user_id, role, organization_id, approval_status, assigned_by, created_at
--   from public.user_roles
--   where role in ('admin','org_admin','super_admin') and (assigned_by = user_id or organization_id is null)
--   order by created_at desc;
--   select id, student_id, verification_status, faculty_id from public.certificates
--   where verification_status = 'verified' and faculty_id is null;
--   select proname, pg_get_functiondef(oid) from pg_proc
--   where proname in ('is_org_admin_no_rls','is_super_admin_no_rls','get_user_org_id');
