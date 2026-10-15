-- migrate: baseline
-- Schema cleanup, step 2 of 5: INTEGRITY (foreign-key rules, constraints, trigger fixes).
-- APPLIED to production 2026-10-15; apply after 20261015_01_expand.sql. Idempotent where possible; one transaction.
-- Plain ASCII on purpose.
--
-- What this does
--   * Delete rules made deliberate: an organization can no longer be hard-deleted out from under its certificates
--     (RESTRICT); deleting a reviewer or an audit actor no longer fails (SET NULL); audit rows survive deletions.
--   * certificates.date_issued is a date; title/institution are never NULL; confidence is 0..1.
--   * user_roles: the legacy "first admin becomes super admin" trigger and its one-row unique index are removed;
--     protect_primary_admin stops blocking the backend (it used to block the service role, so org hard-deletes and
--     user deletions of a primary admin could never succeed); the last super admin cannot be removed; the
--     organizations.primary_admin_id pointer is kept in sync by the database.
--   * role_requests.id becomes a uuid (the code validates it as a uuid; a bigint id made every approve/deny a 400);
--     at most one open request per (user, organization, role).
--   * audit_logs becomes append-only (referential SET NULL clean-ups still work).
--   * verifiable_credentials: status CHECK, real foreign keys, at most ONE active credential per certificate.
--   * trusted_issuers: names unique per organization, not globally; confidence 0..1.

begin;

-- ----------------------------------------------------------------------------- certificates
update public.certificates set date_issued = coalesce(date_issued, created_at) where date_issued is null;
alter table public.certificates
  alter column date_issued type date using (date_issued at time zone 'UTC')::date;
alter table public.certificates alter column date_issued set default current_date;
alter table public.certificates alter column date_issued set not null;

update public.certificates set title = 'Untitled certificate' where title is null or btrim(title) = '';
update public.certificates set institution = '' where institution is null;
alter table public.certificates alter column title set default 'Untitled certificate';
alter table public.certificates alter column title set not null;
alter table public.certificates alter column institution set default '';
alter table public.certificates alter column institution set not null;
alter table public.certificates alter column description set default '';

alter table public.certificates drop constraint if exists certificates_confidence_check;
alter table public.certificates add constraint certificates_confidence_check
  check (confidence_score is null or (confidence_score >= 0 and confidence_score <= 1));

-- reviewer pointer: auth.users (profiles rows may be missing for admins), kept when the reviewer is deleted
alter table public.certificates drop constraint if exists certificates_faculty_id_fkey;
alter table public.certificates add constraint certificates_faculty_id_fkey
  foreign key (faculty_id) references auth.users(id) on delete set null;

-- an organization with certificates cannot be hard-deleted; deactivate it (is_active / deleted_at) instead
alter table public.certificates drop constraint if exists certificates_organization_id_fkey;
alter table public.certificates add constraint certificates_organization_id_fkey
  foreign key (organization_id) references public.organizations(id) on delete restrict;

-- ----------------------------------------------------------------------------- profiles
alter table public.profiles drop constraint if exists profiles_organization_id_fkey;
alter table public.profiles add constraint profiles_organization_id_fkey
  foreign key (organization_id) references public.organizations(id) on delete set null;

alter table public.profiles drop constraint if exists profiles_gpa_check;
alter table public.profiles add constraint profiles_gpa_check check (gpa is null or (gpa >= 0 and gpa <= 10));

-- users may only point their own profile at an organization they actually belong to
create or replace function public.profiles_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() = 'authenticated'
     and new.organization_id is not null
     and (tg_op = 'INSERT' or new.organization_id is distinct from old.organization_id) then
    if not exists (
      select 1 from public.user_roles r
       where r.user_id = auth.uid()
         and r.organization_id = new.organization_id
         and r.approval_status = 'approved'
    ) then
      raise exception 'Profile organization must be one you belong to' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.profiles_guard() from public, anon, authenticated;

drop trigger if exists trg_profiles_guard on public.profiles;
create trigger trg_profiles_guard before insert or update of organization_id on public.profiles
  for each row execute function public.profiles_guard();

-- ----------------------------------------------------------------------------- user_roles
-- legacy: "the first admin becomes super admin" (and a unique index that allows ONE flagged row in the table)
drop trigger if exists auto_designate_first_admin_trigger on public.user_roles;
drop function if exists public.auto_designate_first_admin();
drop index if exists public.unique_super_admin;

alter function public.auto_designate_first_org_admin() set search_path = public;

alter table public.user_roles drop constraint if exists user_roles_approved_by_fkey;
alter table public.user_roles add constraint user_roles_approved_by_fkey
  foreign key (approved_by) references auth.users(id) on delete set null;

alter table public.user_roles drop constraint if exists user_roles_super_admin_platform_check;
alter table public.user_roles add constraint user_roles_super_admin_platform_check
  check (role <> 'super_admin' or organization_id is null);

alter table public.user_roles drop constraint if exists user_roles_primary_admin_approved_check;
alter table public.user_roles add constraint user_roles_primary_admin_approved_check
  check (is_primary_admin is not true or approval_status = 'approved');

-- primary admin protection that does not lock out the backend:
--   * no JWT (service role, SQL console, cascades from auth.users / organizations) -> allowed
--   * the guarded transfer path sets app.allow_primary_admin_change = 'on' -> allowed
--   * an approved super admin -> allowed
--   * everyone else -> a primary admin can be neither demoted, moved nor deleted
create or replace function public.protect_primary_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null
     or current_setting('app.allow_primary_admin_change', true) = 'on'
     or public.authz_is_super_admin() then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if tg_op = 'UPDATE' and old.is_primary_admin is true then
    if new.role <> 'org_admin' then
      raise exception 'Cannot demote the primary administrator. Transfer primary admin status first.';
    end if;
    if new.is_primary_admin is not true then
      raise exception 'Cannot remove primary admin status directly. Use the transfer function.';
    end if;
    if new.organization_id is distinct from old.organization_id then
      raise exception 'Cannot move the primary administrator to a different organization.';
    end if;
  end if;

  if tg_op = 'DELETE' then
    if old.is_primary_admin is true then
      raise exception 'Cannot delete the primary administrator. Transfer primary admin status first.';
    end if;
    return old;
  end if;
  return new;
end;
$$;

-- the live trigger is one trigger for UPDATE and DELETE; recreate it the same way
drop trigger if exists protect_primary_admin_trigger on public.user_roles;
create trigger protect_primary_admin_trigger before update or delete on public.user_roles
  for each row execute function public.protect_primary_admin();

-- the platform can have several super admins but never zero
create or replace function public.guard_last_super_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_setting('app.bypass_last_admin_guard', true) = 'on' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if old.role = 'super_admin' and old.approval_status = 'approved'
     and (tg_op = 'DELETE' or new.role <> 'super_admin' or new.approval_status <> 'approved') then
    if not exists (
      select 1 from public.user_roles r
       where r.role = 'super_admin' and r.approval_status = 'approved' and r.id <> old.id
    ) then
      raise exception 'Cannot remove or demote the last super admin' using errcode = '23514';
    end if;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_last_super_admin on public.user_roles;
create trigger trg_guard_last_super_admin before update or delete on public.user_roles
  for each row execute function public.guard_last_super_admin();

-- an organization can never lose its LAST approved admin (org_admin or admin). This is the database-level backstop for
-- the application's check, which cannot be atomic across requests. It supersedes the draft 20261014_authz_03.
-- Deleting the organization itself is fine (the cascade removes its roles); anything else, including deleting the
-- user account of the last admin, is refused unless app.bypass_last_admin_guard = 'on' for the transaction.
create or replace function public.guard_last_org_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  was_admin boolean;
  still_admin boolean;
begin
  if coalesce(current_setting('app.bypass_last_admin_guard', true), '') = 'on' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  was_admin := old.organization_id is not null
               and old.approval_status = 'approved'
               and old.role in ('org_admin', 'admin');

  if was_admin then
    still_admin := tg_op <> 'DELETE'
                   and new.organization_id is not distinct from old.organization_id
                   and new.approval_status = 'approved'
                   and new.role in ('org_admin', 'admin');
    if not still_admin then
      -- the organization row is already gone: this delete is the cascade of deleting the organization
      if not exists (select 1 from public.organizations o where o.id = old.organization_id) then
        if tg_op = 'DELETE' then return old; end if;
        return new;
      end if;
      if not exists (
        select 1 from public.user_roles r
         where r.organization_id = old.organization_id
           and r.user_id <> old.user_id
           and r.approval_status = 'approved'
           and r.role in ('org_admin', 'admin')
      ) then
        raise exception 'An organization must keep at least one approved admin' using errcode = '23514';
      end if;
    end if;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke execute on function public.guard_last_org_admin() from public, anon, authenticated;

drop trigger if exists trg_guard_last_org_admin on public.user_roles;
create trigger trg_guard_last_org_admin before update or delete on public.user_roles
  for each row execute function public.guard_last_org_admin();

-- organizations.primary_admin_id is a pointer to the user_roles.is_primary_admin row; keep it in sync in the database
update public.organizations o
   set primary_admin_id = r.user_id
  from public.user_roles r
 where r.organization_id = o.id and r.is_primary_admin is true and o.primary_admin_id is distinct from r.user_id;

create or replace function public.sync_org_primary_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op in ('INSERT', 'UPDATE') and new.is_primary_admin is true and new.organization_id is not null then
    update public.organizations set primary_admin_id = new.user_id
     where id = new.organization_id and primary_admin_id is distinct from new.user_id;
  elsif old.is_primary_admin is true and old.organization_id is not null
        and (tg_op = 'DELETE' or new.is_primary_admin is not true) then
    update public.organizations set primary_admin_id = null
     where id = old.organization_id and primary_admin_id = old.user_id;
  end if;
  return null;
end;
$$;

revoke execute on function public.guard_last_super_admin() from public, anon, authenticated;
revoke execute on function public.sync_org_primary_admin() from public, anon, authenticated;
revoke execute on function public.protect_primary_admin() from public, anon, authenticated;

drop trigger if exists trg_sync_org_primary_admin on public.user_roles;
create trigger trg_sync_org_primary_admin after insert or update of is_primary_admin or delete on public.user_roles
  for each row execute function public.sync_org_primary_admin();

-- ----------------------------------------------------------------------------- organizations
alter table public.organizations drop constraint if exists organizations_slug_unique;   -- duplicate of organizations_slug_key

alter table public.organizations drop constraint if exists organizations_type_check;
alter table public.organizations add constraint organizations_type_check
  check (type = any (array['university', 'college', 'school', 'institute', 'company', 'enterprise']));

alter table public.organizations drop constraint if exists organizations_slug_format;
alter table public.organizations add constraint organizations_slug_format
  check (slug = lower(slug) and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$') not valid;
do $$
begin
  alter table public.organizations validate constraint organizations_slug_format;
exception when check_violation then
  raise notice 'organizations: some slugs are not lowercase-hyphenated; organizations_slug_format stays NOT VALID (enforced for new rows only)';
end $$;

-- ----------------------------------------------------------------------------- role_requests
do $$
begin
  if (select data_type from information_schema.columns
      where table_schema = 'public' and table_name = 'role_requests' and column_name = 'id') = 'bigint' then
    alter table public.role_requests add column id_new uuid not null default gen_random_uuid();
    alter table public.role_requests drop constraint role_requests_pkey;
    alter table public.role_requests drop column id;
    alter table public.role_requests rename column id_new to id;
    alter table public.role_requests add primary key (id);
  end if;
end $$;

alter table public.role_requests drop constraint if exists role_requests_user_id_fkey;
alter table public.role_requests add constraint role_requests_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade;
alter table public.role_requests drop constraint if exists role_requests_reviewed_by_fkey;
alter table public.role_requests add constraint role_requests_reviewed_by_fkey
  foreign key (reviewed_by) references auth.users(id) on delete set null;

alter table public.role_requests alter column metadata set default '{}'::jsonb;
update public.role_requests set metadata = '{}'::jsonb where metadata is null;

-- at most one open request per (user, organization, role)
create unique index if not exists role_requests_one_pending_idx
  on public.role_requests (user_id, organization_id, requested_role) where status = 'pending';

-- ----------------------------------------------------------------------------- trusted_issuers
alter table public.trusted_issuers drop constraint if exists trusted_issuers_name_key;
create unique index if not exists trusted_issuers_org_name_key
  on public.trusted_issuers (organization_id, lower(name)) nulls not distinct;
alter table public.trusted_issuers drop constraint if exists trusted_issuers_confidence_check;
alter table public.trusted_issuers add constraint trusted_issuers_confidence_check
  check (confidence_threshold >= 0 and confidence_threshold <= 1);

-- ----------------------------------------------------------------------------- recruiter_* tables
update public.recruiter_contacts set response_received = false where response_received is null;
update public.recruiter_contacts set contacted_at = coalesce(contacted_at, now()), created_at = coalesce(created_at, now());
alter table public.recruiter_contacts alter column response_received set not null;
alter table public.recruiter_contacts alter column contacted_at set not null;
alter table public.recruiter_contacts alter column created_at set not null;
update public.recruiter_favorites set created_at = now() where created_at is null;
alter table public.recruiter_favorites alter column created_at set not null;
update public.recruiter_pipeline set created_at = coalesce(created_at, now()), updated_at = coalesce(updated_at, now());
alter table public.recruiter_pipeline alter column created_at set not null;
alter table public.recruiter_pipeline alter column updated_at set not null;

do $$
begin
  if not exists (select 1 from public.recruiter_contacts where organization_id is null) then
    alter table public.recruiter_contacts alter column organization_id set not null;
  else raise notice 'recruiter_contacts has rows without organization_id: NOT NULL skipped'; end if;
  if not exists (select 1 from public.recruiter_favorites where organization_id is null) then
    alter table public.recruiter_favorites alter column organization_id set not null;
  else raise notice 'recruiter_favorites has rows without organization_id: NOT NULL skipped'; end if;
  if not exists (select 1 from public.recruiter_pipeline where organization_id is null) then
    alter table public.recruiter_pipeline alter column organization_id set not null;
  else raise notice 'recruiter_pipeline has rows without organization_id: NOT NULL skipped'; end if;
end $$;

-- ----------------------------------------------------------------------------- audit_logs
alter table public.audit_logs drop constraint if exists audit_logs_actor_id_fkey;
alter table public.audit_logs add constraint audit_logs_actor_id_fkey
  foreign key (actor_id) references auth.users(id) on delete set null;

-- append-only: UPDATE/DELETE/TRUNCATE are refused, except the referential SET NULL clean-ups (actor / organization /
-- target user going away) and an explicit maintenance window (set app.audit_maintenance = 'on' in a transaction)
create or replace function public.audit_logs_immutable()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_setting('app.audit_maintenance', true) = 'on' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  -- written through jsonb so it keeps working after target_user_id is dropped in step 08
  if tg_op = 'UPDATE'
     and (to_jsonb(new) - 'actor_id' - 'organization_id' - 'target_user_id')
         = (to_jsonb(old) - 'actor_id' - 'organization_id' - 'target_user_id')
     and (to_jsonb(new) ->> 'actor_id' is null or to_jsonb(new) ->> 'actor_id' = to_jsonb(old) ->> 'actor_id')
     and (to_jsonb(new) ->> 'organization_id' is null or to_jsonb(new) ->> 'organization_id' = to_jsonb(old) ->> 'organization_id')
     and (to_jsonb(new) ->> 'target_user_id' is null or to_jsonb(new) ->> 'target_user_id' = to_jsonb(old) ->> 'target_user_id') then
    return new;
  end if;

  raise exception 'audit_logs is append-only' using errcode = '55000';
end;
$$;

drop trigger if exists trg_audit_logs_immutable on public.audit_logs;
create trigger trg_audit_logs_immutable before update or delete on public.audit_logs
  for each row execute function public.audit_logs_immutable();
drop trigger if exists trg_audit_logs_no_truncate on public.audit_logs;
create trigger trg_audit_logs_no_truncate before truncate on public.audit_logs
  for each statement execute function public.audit_logs_immutable();

-- ----------------------------------------------------------------------------- verifiable_credentials
alter table public.verifiable_credentials drop constraint if exists verifiable_credentials_status_check;
alter table public.verifiable_credentials add constraint verifiable_credentials_status_check
  check (status in ('active', 'revoked'));

-- enforced for new writes; old revoked rows may predate revoked_at, so it is left NOT VALID on purpose
alter table public.verifiable_credentials drop constraint if exists verifiable_credentials_revoked_has_time;
alter table public.verifiable_credentials add constraint verifiable_credentials_revoked_has_time
  check (status = 'active' or revoked_at is not null) not valid;

-- a credential outlives its certificate (it is revoked, not deleted), and its organization link is informational
alter table public.verifiable_credentials drop constraint if exists verifiable_credentials_certificate_id_fkey;
alter table public.verifiable_credentials add constraint verifiable_credentials_certificate_id_fkey
  foreign key (certificate_id) references public.certificates(id) on delete set null;
alter table public.verifiable_credentials drop constraint if exists verifiable_credentials_organization_id_fkey;
alter table public.verifiable_credentials add constraint verifiable_credentials_organization_id_fkey
  foreign key (organization_id) references public.organizations(id) on delete set null;

-- let PostgREST (the Supabase API) pick up the new / removed columns immediately
notify pgrst, 'reload schema';

commit;
