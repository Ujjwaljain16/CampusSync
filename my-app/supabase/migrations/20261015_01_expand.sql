-- Schema cleanup, step 1 of 5: EXPAND (additive; the application code deployed today keeps working).
-- DRAFT: review against the live schema, run 20261015_00_preflight.sql first. Idempotent; one transaction.
-- Plain ASCII on purpose. Nothing here drops or narrows anything except the profiles.role CHECK (widened).
--
-- What this does
--   * profiles: the columns the code already reads/writes but the table never had (company_name, phone, linkedin,
--     github, portfolio), the two privacy switches, updated_at, a wider gpa, a CHECK that accepts all six roles.
--   * certificates: verification_details (read by the metadata/analytics code), storage_path (needed to ever make the
--     bucket private), reviewed_at. verification_status becomes NOT NULL and the legacy `status` column becomes a
--     derived mirror kept in sync by a trigger (so old and new code agree), instead of drifting.
--   * verifiable_credentials: real certificate_id / organization_id columns, backfilled from the signed JSON and kept
--     in sync by a trigger, so credentials can be found without JSON scans.
--   * audit_logs: target_type + target_id as text (credential ids are urn:uuid:... strings and could never be logged).
--   * organization_domains: one row per claimed domain with a database-enforced UNIQUE(domain), kept in sync from
--     organizations.settings.allowed_email_domains until the code reads the table directly.
--   * generic updated_at trigger on the tables that should have one.

begin;

-- ----------------------------------------------------------------------------- generic helpers
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ----------------------------------------------------------------------------- profiles
alter table public.profiles
  add column if not exists company_name text,
  add column if not exists phone text,
  add column if not exists linkedin text,
  add column if not exists github text,
  add column if not exists portfolio text,
  add column if not exists public_portfolio_enabled boolean not null default false,
  add column if not exists recruiter_share_contact boolean not null default false,
  add column if not exists updated_at timestamptz not null default now();

-- the old column was called "company"; the code reads company_name
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'profiles' and column_name = 'company') then
    update public.profiles set company_name = company where company_name is null and company is not null;
  end if;
end $$;

update public.profiles set created_at = now() where created_at is null;
alter table public.profiles alter column created_at set not null;
alter table public.profiles alter column created_at set default now();
alter table public.profiles alter column gpa type numeric(4,2);   -- numeric(3,2) could not store a GPA of 10.00

-- (profiles.role is dropped in step 08; this block is skipped when the file is re-run afterwards)
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'profiles' and column_name = 'role') then
    alter table public.profiles alter column role set default 'student';
    alter table public.profiles drop constraint if exists profiles_role_check;
    alter table public.profiles add constraint profiles_role_check
      check (role = any (array['student', 'faculty', 'admin', 'recruiter', 'org_admin', 'super_admin']));
  end if;
end $$;

-- one profile per e-mail (replaces O(users) scans of auth.admin.listUsers); skipped when duplicates exist
do $$
begin
  if exists (select 1 from public.profiles where email is not null group by lower(email) having count(*) > 1) then
    raise notice 'profiles: duplicate e-mails found, unique index profiles_email_lower_key NOT created';
  else
    create unique index if not exists profiles_email_lower_key on public.profiles (lower(email)) where email is not null;
  end if;
end $$;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------- user_roles / trusted_issuers / allowed_domains: updated_at
drop trigger if exists trg_user_roles_updated_at on public.user_roles;
create trigger trg_user_roles_updated_at before update on public.user_roles
  for each row execute function public.set_updated_at();

drop trigger if exists trg_trusted_issuers_updated_at on public.trusted_issuers;
create trigger trg_trusted_issuers_updated_at before update on public.trusted_issuers
  for each row execute function public.set_updated_at();

drop trigger if exists trg_allowed_domains_updated_at on public.allowed_domains;
create trigger trg_allowed_domains_updated_at before update on public.allowed_domains
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------- certificates
alter table public.certificates
  add column if not exists verification_details jsonb not null default '{}'::jsonb,
  add column if not exists storage_path text,
  add column if not exists reviewed_at timestamptz;

-- verification_status is the truth the application uses; status was drifting away from it
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'certificates' and column_name = 'status') then
    update public.certificates
       set verification_status = case status when 'approved' then 'verified' when 'rejected' then 'rejected' else 'pending' end
     where verification_status is null;
  end if;
end $$;
alter table public.certificates alter column verification_status set not null;
alter table public.certificates alter column verification_status set default 'pending';

-- (certificates.status is dropped in step 08; skipped when this file is re-run afterwards)
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'certificates' and column_name = 'status') then
    update public.certificates
       set status = case verification_status when 'verified' then 'approved' else verification_status end
     where status is distinct from case verification_status when 'verified' then 'approved' else verification_status end;
  end if;
end $$;

-- object path inside the bucket (the full public URL stays in file_url until the bucket can go private)
update public.certificates
   set storage_path = substring(file_url from '/storage/v1/object/public/certificates/(.+)$')
 where storage_path is null and file_url ~ '/storage/v1/object/public/certificates/.+';

update public.certificates
   set reviewed_at = updated_at
 where verification_status in ('verified', 'rejected') and reviewed_at is null;

create or replace function public.certificates_before_write()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- legacy status is derived from verification_status, never the other way round. Written through jsonb so the
  -- function keeps working once the status column is dropped in step 08 (and when this file is re-run afterwards).
  if to_jsonb(new) ? 'status' then
    new := jsonb_populate_record(
      new,
      jsonb_build_object('status', case new.verification_status when 'verified' then 'approved' else new.verification_status end)
    );
  end if;
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

drop trigger if exists trg_certificates_before_write on public.certificates;
create trigger trg_certificates_before_write before insert or update on public.certificates
  for each row execute function public.certificates_before_write();

-- ----------------------------------------------------------------------------- verifiable_credentials
alter table public.verifiable_credentials
  add column if not exists certificate_id uuid,
  add column if not exists organization_id uuid,
  add column if not exists status_list_id text,
  add column if not exists status_list_index integer;

update public.verifiable_credentials v
   set certificate_id = (v.credential #>> '{credentialSubject,certificateId}')::uuid
 where v.certificate_id is null
   and (v.credential #>> '{credentialSubject,certificateId}') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   and exists (select 1 from public.certificates c where c.id = (v.credential #>> '{credentialSubject,certificateId}')::uuid);

update public.verifiable_credentials v
   set organization_id = c.organization_id
  from public.certificates c
 where c.id = v.certificate_id and v.organization_id is null;

update public.verifiable_credentials set created_at = issuance_date where created_at is null;
alter table public.verifiable_credentials alter column created_at set not null;
alter table public.verifiable_credentials alter column created_at set default now();

-- keeps the two columns in sync for code that only knows the signed JSON (security definer: the lookup must work
-- even when the inserting role cannot see the certificate row)
create or replace function public.vc_before_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cid text;
begin
  if new.certificate_id is null then
    cid := new.credential #>> '{credentialSubject,certificateId}';
    if cid ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       and exists (select 1 from public.certificates c where c.id = cid::uuid) then
      new.certificate_id := cid::uuid;
    end if;
  end if;
  if new.organization_id is null and new.certificate_id is not null then
    select c.organization_id into new.organization_id from public.certificates c where c.id = new.certificate_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_vc_before_write on public.verifiable_credentials;
create trigger trg_vc_before_write before insert or update of credential, certificate_id on public.verifiable_credentials
  for each row execute function public.vc_before_write();

revoke execute on function public.vc_before_write() from public, anon, authenticated;

-- ----------------------------------------------------------------------------- audit_logs
alter table public.audit_logs add column if not exists target_type text;

do $$
begin
  if (select data_type from information_schema.columns
      where table_schema = 'public' and table_name = 'audit_logs' and column_name = 'target_id') = 'uuid' then
    alter table public.audit_logs alter column target_id type text using target_id::text;
  end if;
end $$;

-- target_user_id was a second, never-written-by-the-app way to name the subject: fold it into (target_type, target_id)
-- (target_user_id is dropped in step 08; skipped when this file is re-run afterwards)
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'audit_logs' and column_name = 'target_user_id') then
    update public.audit_logs
       set target_type = 'user', target_id = target_user_id::text
     where target_id is null and target_user_id is not null;
  end if;
end $$;

update public.audit_logs set details = '{}'::jsonb where details is null;
update public.audit_logs set created_at = now() where created_at is null;
alter table public.audit_logs alter column details set default '{}'::jsonb;
alter table public.audit_logs alter column details set not null;
alter table public.audit_logs alter column created_at set default now();
alter table public.audit_logs alter column created_at set not null;

-- ----------------------------------------------------------------------------- organization_domains
create table if not exists public.organization_domains (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  domain text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint organization_domains_domain_key unique (domain),
  constraint organization_domains_domain_format check (
    domain = lower(domain)
    and domain ~ '^(\*\.)?[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'
  )
);
create index if not exists organization_domains_org_idx on public.organization_domains (organization_id);
alter table public.organization_domains enable row level security;

drop policy if exists "org admins read org domains" on public.organization_domains;
create policy "org admins read org domains" on public.organization_domains
  for select to authenticated
  using (public.authz_actor_rank(organization_id) >= 60);

-- backfill from the JSON setting (valid, first claimant wins; conflicts are listed by the pre-flight)
insert into public.organization_domains (organization_id, domain)
select distinct on (lower(btrim(d))) o.id, lower(btrim(d))
  from public.organizations o,
       jsonb_array_elements_text(coalesce(o.settings -> 'allowed_email_domains', '[]'::jsonb)) d
 where lower(btrim(d)) ~ '^(\*\.)?[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'
 order by lower(btrim(d)), o.created_at
on conflict (domain) do nothing;

-- keeps the table in sync with the JSON setting until the code reads the table directly. A domain already claimed
-- by ANOTHER organization raises unique_violation (23505), so squatting is rejected by the database itself.
create or replace function public.sync_org_domains()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  wanted text[];
begin
  select coalesce(array_agg(distinct lower(btrim(d))), '{}'::text[]) into wanted
    from jsonb_array_elements_text(coalesce(new.settings -> 'allowed_email_domains', '[]'::jsonb)) d
   where lower(btrim(d)) ~ '^(\*\.)?[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$';

  delete from public.organization_domains od
   where od.organization_id = new.id and not (od.domain = any (wanted));

  insert into public.organization_domains (organization_id, domain)
  select new.id, w
    from unnest(wanted) w
   where not exists (select 1 from public.organization_domains x where x.organization_id = new.id and x.domain = w);

  return null;
end;
$$;

revoke execute on function public.sync_org_domains() from public, anon, authenticated;

drop trigger if exists trg_sync_org_domains on public.organizations;
create trigger trg_sync_org_domains after insert or update of settings on public.organizations
  for each row execute function public.sync_org_domains();

-- let PostgREST (the Supabase API) pick up the new / removed columns immediately
notify pgrst, 'reload schema';

commit;
