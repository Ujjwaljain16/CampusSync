-- Schema cleanup, step 8 of 8: CONTRACT (remove what is dead).
-- *** APPLY ONLY AFTER the application cleanup PR is deployed (list in docs/DATABASE-SCHEMA.md, "Code changes"). ***
-- DRAFT. One transaction. Plain ASCII on purpose. Requires 20261015_01..04 and authz_05a/05b to be applied.
--
-- Every table drop refuses to run when the table holds data; every column drop that could lose data is guarded by a
-- "all NULL" check. Policies and trigger functions that mention a column are rewritten BEFORE the column is dropped.
--
-- Removed
--   tables:    documents (+ never-created document_metadata), verification_results, recruiter_org_access,
--              super_admin_audit, migration_status
--   functions: ~27 unused SECURITY DEFINER leftovers of earlier designs (the app calls none of them)
--   columns:   certificates.status (derived mirror), certificates.qr_code_data / digital_signature / issuer_verified /
--              ocr_text (never read or written), profiles.role / profiles.company, user_roles.is_super_admin,
--              organizations.usage_stats, audit_logs.target_user_id

begin;

-- ----------------------------------------------------------------------------- tables (guarded: must be empty)
do $$
declare
  t text;
  n bigint;
begin
  foreach t in array array['documents', 'verification_results', 'recruiter_org_access', 'super_admin_audit'] loop
    if to_regclass('public.' || t) is not null then
      execute format('select count(*) from public.%I', t) into n;
      if n = 0 then
        execute format('drop table public.%I', t);
      else
        raise exception 'public.% still has % rows; refusing to drop it. Export or migrate them first.', t, n;
      end if;
    end if;
  end loop;

  if to_regclass('public.migration_status') is not null then
    if exists (select 1 from public.migration_status
                where migration_name <> 'certificates_to_documents' or status <> 'pending') then
      raise exception 'public.migration_status holds more than the abandoned certificates_to_documents entry; refusing to drop it.';
    end if;
    drop table public.migration_status;
  end if;
end $$;

-- ----------------------------------------------------------------------------- functions (no CASCADE on purpose)
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p
     where p.pronamespace = 'public'::regnamespace
       and p.proname = any (array[
         'drop_certificates_table', 'mark_certificates_migrated', 'is_certificates_migrated',
         'enqueue_job', 'complete_job', 'get_next_job', 'update_organization_usage_stats',
         'update_faculty_approval', 'ensure_student_role', 'get_super_admin', 'get_user_role',
         'get_pending_faculty_requests', 'get_user_accessible_orgs', 'can_access_org', 'check_recruiter_access',
         'get_user_organization', 'is_admin_no_rls', 'is_org_admin', 'is_organization_primary_admin',
         'get_accuracy_metrics', 'get_correction_stats', 'create_next_month_partition', 'drop_old_audit_partitions',
         'cleanup_org_access_on_platform_revoke', 'is_super_admin', 'get_organization_primary_admin', 'ensure_role'
       ])
  loop
    execute format('drop function if exists %s', r.sig);
  end loop;

  -- the three RPCs the application still calls are for signed-in callers only
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p
     where p.pronamespace = 'public'::regnamespace
       and p.proname = any (array['check_and_reserve_slug', 'generate_organization_slug', 'transfer_primary_admin'])
  loop
    execute format('revoke execute on function %s from public, anon', r.sig);
  end loop;
end $$;

-- ----------------------------------------------------------------------------- certificates
-- 1. rewrite everything that mentions the legacy status column
drop policy if exists "Students can insert own certificates in org" on public.certificates;
create policy "Students can insert own certificates in org" on public.certificates
  for insert to authenticated
  with check (
    student_id = (select auth.uid())
    and verification_status = 'pending'
    and organization_id in (
      select ur.organization_id from public.user_roles ur
       where ur.user_id = (select auth.uid()) and ur.approval_status = 'approved'
    )
  );

create or replace function public.certificates_before_write()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.verification_status in ('verified', 'rejected') and new.reviewed_at is null then
      new.reviewed_at := now();
    end if;
  elsif new.verification_status is distinct from old.verification_status then
    new.reviewed_at := case when new.verification_status in ('verified', 'rejected') then now() else null end;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

-- 2. drop the columns
alter table public.certificates drop constraint if exists certificates_status_check;
alter table public.certificates drop column if exists status;

do $$
declare
  c text;
  n bigint;
begin
  foreach c in array array['qr_code_data', 'digital_signature', 'ocr_text'] loop
    if exists (select 1 from information_schema.columns
                where table_schema = 'public' and table_name = 'certificates' and column_name = c) then
      execute format('select count(*) from public.certificates where %I is not null', c) into n;
      if n = 0 then
        execute format('alter table public.certificates drop column %I', c);
      else
        raise notice 'certificates.% holds % non-null values; NOT dropped (export it first)', c, n;
      end if;
    end if;
  end loop;

  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'certificates' and column_name = 'issuer_verified') then
    if not exists (select 1 from public.certificates where issuer_verified is true) then
      alter table public.certificates drop column issuer_verified;
    else
      raise notice 'certificates.issuer_verified has TRUE values; NOT dropped';
    end if;
  end if;
end $$;

-- ----------------------------------------------------------------------------- profiles
-- profiles.role was a second, user-editable copy of user_roles that nothing may trust; company was renamed company_name
do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'profiles' and column_name = 'company') then
    if exists (select 1 from public.profiles where company is not null and company_name is distinct from company) then
      raise notice 'profiles.company has values not present in company_name; NOT dropped';
    else
      alter table public.profiles drop column company;
    end if;
  end if;
end $$;
alter table public.profiles drop column if exists role;

-- ----------------------------------------------------------------------------- user_roles
-- the policies below carried a "not the legacy is_super_admin flag" clause; rewrite them without it
drop policy if exists "Org admins insert their org" on public.user_roles;
create policy "Org admins insert their org" on public.user_roles
  for insert to authenticated
  with check (
    organization_id is not null
    and role <> 'super_admin'
    and user_id <> (select auth.uid())
    and public.authz_actor_rank(organization_id) >= 80
    and public.authz_role_rank(role) < public.authz_actor_rank(organization_id)
  );

drop policy if exists "Org admins update their org" on public.user_roles;
create policy "Org admins update their org" on public.user_roles
  for update to authenticated
  using (
    organization_id is not null
    and user_id <> (select auth.uid())
    and public.authz_actor_rank(organization_id) >= 80
    and public.authz_role_rank(role) < public.authz_actor_rank(organization_id)
  )
  with check (
    organization_id is not null
    and role <> 'super_admin'
    and public.authz_actor_rank(organization_id) >= 80
    and public.authz_role_rank(role) < public.authz_actor_rank(organization_id)
  );

drop policy if exists "Users can insert their own pending roles" on public.user_roles;
create policy "Users can insert their own pending roles" on public.user_roles
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and approval_status = 'pending'
    and role in ('student', 'faculty', 'recruiter')
    and coalesce(is_primary_admin, false) = false
    and not public.authz_has_role_row(organization_id)
  );

alter table public.user_roles drop column if exists is_super_admin;

-- ----------------------------------------------------------------------------- organizations
alter table public.organizations drop column if exists usage_stats;

-- ----------------------------------------------------------------------------- audit_logs
alter table public.audit_logs drop column if exists target_user_id;

-- let PostgREST (the Supabase API) pick up the new / removed columns immediately
notify pgrst, 'reload schema';

commit;
