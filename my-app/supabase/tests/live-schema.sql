-- MODEL of the production schema as introspected on 2026-10-14 (tables, constraints, indexes, triggers, functions and the
-- policies the migrations touch). Identifiers and data are synthetic. Used only by the migration tests in this folder.
-- Reconstruction of the LIVE CampusSync database (from the owner's introspection dumps, 2026-10-14).
-- Only for testing migrations locally; not a migration itself.

create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create schema auth;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;
create function auth.role() returns text language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$$;
create function uuid_generate_v4() returns uuid language sql as $$ select gen_random_uuid() $$;

grant usage on schema public, auth to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
grant select on auth.users to authenticated, service_role;

-- ------------------------------------------------------------------ organizations
create table public.organizations (
  id uuid not null default gen_random_uuid() primary key,
  name text not null,
  slug text not null,
  subdomain text,
  custom_domain text,
  type text not null,
  email text not null,
  phone text,
  branding jsonb default '{"logo_url": null, "favicon_url": null, "accent_color": "#10b981", "primary_color": "#3b82f6", "secondary_color": "#1e40af"}'::jsonb,
  settings jsonb default '{"features": {"analytics": true, "recruiter_access": true, "student_profiles": true, "certificate_issuance": true, "document_verification": true}, "language": "en", "timezone": "UTC", "enable_sso": false, "date_format": "YYYY-MM-DD", "sso_provider": null, "allowed_email_domains": [], "require_email_verification": true}'::jsonb,
  subscription jsonb default '{"plan": "free", "status": "active", "max_users": 100, "expires_at": null, "started_at": null, "billing_email": null, "trial_ends_at": null, "max_storage_gb": 5, "max_documents_per_month": 500}'::jsonb,
  usage_stats jsonb default '{"total_users": 0, "total_documents": 0, "monthly_api_calls": 0, "last_calculated_at": null, "total_storage_bytes": 0}'::jsonb,
  is_active boolean not null default true,
  is_verified boolean not null default false,
  verified_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary_admin_id uuid references auth.users(id) on delete set null,
  website text,
  address text,
  constraint organizations_custom_domain_key unique (custom_domain),
  constraint organizations_email_unique unique (email),
  constraint organizations_slug_key unique (slug),
  constraint organizations_slug_unique unique (slug),
  constraint organizations_subdomain_key unique (subdomain),
  constraint organizations_type_check check (type = any (array['university','college','school','institute','enterprise']))
);
create index idx_organizations_active on public.organizations (is_active);
create index idx_organizations_created_at on public.organizations (created_at desc);
create index idx_organizations_custom_domain on public.organizations (custom_domain) where custom_domain is not null;
create index idx_organizations_email on public.organizations (email);
create index idx_organizations_is_active on public.organizations (is_active);
create index idx_organizations_slug on public.organizations (slug);
create index idx_organizations_subdomain on public.organizations (subdomain) where subdomain is not null;
create index idx_organizations_type on public.organizations (type);
create index idx_organizations_website on public.organizations (website) where website is not null;

-- ------------------------------------------------------------------ profiles
create table public.profiles (
  id uuid not null primary key references auth.users(id) on delete cascade,
  role text not null,
  full_name text,
  created_at timestamptz default now(),
  avatar_url text,
  university text,
  graduation_year integer,
  major text,
  location text,
  gpa numeric(3,2),
  email text,
  department text,
  company text,
  organization_id uuid references public.organizations(id) on delete cascade,
  constraint profiles_role_check check (role = any (array['student','faculty','admin','recruiter']))
);
create index idx_profiles_created_at on public.profiles (created_at desc);

-- ------------------------------------------------------------------ user_roles
create table public.user_roles (
  id uuid not null default gen_random_uuid() primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null,
  assigned_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  is_super_admin boolean default false,
  organization_id uuid references public.organizations(id) on delete cascade,
  is_primary_admin boolean default false,
  approval_status text not null default 'approved',
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  approval_notes text,
  constraint check_primary_admin_role check (is_primary_admin = false or (is_primary_admin = true and role = 'org_admin')),
  constraint user_roles_approval_status_check check (approval_status = any (array['pending','approved','denied'])),
  constraint user_roles_role_check check (role = any (array['student','faculty','admin','recruiter','org_admin','super_admin'])),
  constraint user_roles_user_org_unique unique nulls not distinct (user_id, organization_id)
);
create index idx_user_roles_approval on public.user_roles (approval_status);
create index idx_user_roles_approval_pending on public.user_roles (organization_id, approval_status) where approval_status = 'pending';
create index idx_user_roles_org_role on public.user_roles (organization_id, role);
create index idx_user_roles_organization_id on public.user_roles (organization_id);
create index idx_user_roles_role on public.user_roles (role);
create index idx_user_roles_user_id on public.user_roles (user_id);
create index idx_user_roles_user_org on public.user_roles (user_id, organization_id);
create index idx_user_roles_user_role on public.user_roles (user_id, role);
create unique index unique_primary_admin_per_org on public.user_roles (organization_id) where is_primary_admin = true and organization_id is not null;
create unique index unique_super_admin on public.user_roles (is_super_admin) where is_super_admin = true;
create unique index user_roles_user_role_org_unique on public.user_roles (user_id, role, organization_id) where organization_id is not null;
create unique index user_roles_user_role_platform_unique on public.user_roles (user_id, role) where organization_id is null;

-- ------------------------------------------------------------------ role_requests
create table public.role_requests (
  id bigserial primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  requested_role text not null,
  metadata jsonb,
  status text not null default 'pending',
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  constraint role_requests_requested_role_check check (requested_role = any (array['recruiter','faculty','admin'])),
  constraint role_requests_status_check check (status = any (array['pending','approved','rejected','cancelled']))
);
create index idx_role_requests_created_at on public.role_requests (created_at desc);
create index idx_role_requests_org_status on public.role_requests (organization_id, status);
create index idx_role_requests_organization_id on public.role_requests (organization_id);
create index idx_role_requests_status on public.role_requests (status);
create index idx_role_requests_status_created on public.role_requests (status, created_at desc);
create index idx_role_requests_user on public.role_requests (user_id, status);
create index idx_role_requests_user_id on public.role_requests (user_id);

-- ------------------------------------------------------------------ allowed_domains / trusted_issuers
create table public.allowed_domains (
  id uuid not null default gen_random_uuid() primary key,
  domain text not null,
  description text,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint allowed_domains_domain_key unique (domain)
);
create index idx_allowed_domains_active on public.allowed_domains (is_active);
create index idx_allowed_domains_domain on public.allowed_domains (domain);

create table public.trusted_issuers (
  id uuid not null default gen_random_uuid() primary key,
  name text not null,
  domain text,
  logo_hash text,
  template_patterns jsonb not null default '[]'::jsonb,
  confidence_threshold numeric(3,2) not null default 0.9,
  qr_verification_url text,
  is_active boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  organization_id uuid references public.organizations(id) on delete cascade,
  constraint trusted_issuers_name_key unique (name)
);
create index idx_trusted_issuers_active on public.trusted_issuers (is_active) where is_active = true;
create index idx_trusted_issuers_domain on public.trusted_issuers (domain);
create index idx_trusted_issuers_organization_id on public.trusted_issuers (organization_id);

-- ------------------------------------------------------------------ audit_logs
create table public.audit_logs (
  id bigserial primary key,
  actor_id uuid references public.profiles(id),
  action text not null,
  target_id uuid,
  details jsonb,
  created_at timestamptz default now(),
  target_user_id uuid references auth.users(id) on delete set null,
  organization_id uuid references public.organizations(id) on delete set null
);
create index audit_logs_actor_idx on public.audit_logs (actor_id);
create index audit_logs_target_idx on public.audit_logs (target_id);
create index idx_audit_logs_action on public.audit_logs (action);
create index idx_audit_logs_actor_created on public.audit_logs (actor_id, created_at desc);
create index idx_audit_logs_actor_id on public.audit_logs (actor_id);
create index idx_audit_logs_created_at on public.audit_logs (created_at);
create index idx_audit_logs_org_created on public.audit_logs (organization_id, created_at desc) where organization_id is not null;
create index idx_audit_logs_organization_id on public.audit_logs (organization_id);
create index idx_audit_logs_target_created on public.audit_logs (target_id, created_at);
create index idx_audit_logs_target_id on public.audit_logs (target_id) where target_id is not null;
create index idx_audit_logs_target_user_id on public.audit_logs (target_user_id) where target_user_id is not null;
create index idx_audit_logs_user_id on public.audit_logs (target_user_id);

-- ------------------------------------------------------------------ certificates
create table public.certificates (
  id uuid not null default gen_random_uuid() primary key,
  student_id uuid not null references auth.users(id) on delete cascade,
  file_url text not null,
  ocr_text jsonb,
  fields jsonb,
  status text not null default 'pending',
  faculty_id uuid references public.profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  confidence_score numeric(3,2),
  verification_method text,
  auto_approved boolean default false,
  qr_code_data text,
  digital_signature text,
  issuer_verified boolean default false,
  title text,
  institution text,
  date_issued timestamptz,
  description text,
  verification_status text default 'pending',
  organization_id uuid not null references public.organizations(id) on delete cascade,
  constraint certificates_status_check check (status = any (array['pending','approved','rejected'])),
  constraint certificates_verification_status_check check (verification_status = any (array['pending','verified','rejected']))
);
create index certificates_status_idx on public.certificates (status);
create index certificates_student_idx on public.certificates (student_id);
create index idx_certificates_auto_approved on public.certificates (auto_approved);
create index idx_certificates_confidence on public.certificates (confidence_score);
create index idx_certificates_created_at on public.certificates (created_at);
create index idx_certificates_date_issued on public.certificates (date_issued);
create index idx_certificates_faculty_id on public.certificates (faculty_id) where faculty_id is not null;
create index idx_certificates_institution on public.certificates (institution) where institution is not null;
create index idx_certificates_org_created on public.certificates (organization_id, created_at desc);
create index idx_certificates_org_status on public.certificates (organization_id, verification_status);
create index idx_certificates_org_student on public.certificates (organization_id, student_id);
create index idx_certificates_organization_id on public.certificates (organization_id);
create index idx_certificates_status on public.certificates (status);
create index idx_certificates_student_id on public.certificates (student_id);
create index idx_certificates_student_status on public.certificates (student_id, verification_status);
create index idx_certificates_student_verification on public.certificates (student_id, verification_status);
create index idx_certificates_student_verified on public.certificates (student_id) where verification_status = 'verified';
create index idx_certificates_title_institution_search on public.certificates using gin (to_tsvector('english', coalesce(title, '') || ' ' || coalesce(institution, '') || ' ' || coalesce(description, '')));
create index idx_certificates_verification_method on public.certificates (verification_method);
create index idx_certificates_verification_status on public.certificates (verification_status);

-- ------------------------------------------------------------------ verifiable_credentials
create table public.verifiable_credentials (
  id text not null primary key,
  issuer text not null,
  issuance_date timestamptz not null,
  credential jsonb not null,
  created_at timestamptz default now(),
  status text not null default 'active',
  revoked_at timestamptz,
  revoked_reason text,
  student_id uuid not null references auth.users(id) on delete cascade
);

-- ------------------------------------------------------------------ documents (empty, abandoned design)
create table public.documents (
  id uuid not null default uuid_generate_v4() primary key,
  student_id uuid not null references public.profiles(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  document_type text not null,
  title text not null,
  institution text,
  issue_date date,
  file_url text not null,
  ocr_text text,
  ocr_confidence numeric(4,3),
  verification_status text not null default 'pending',
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  proper_id uuid default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  constraint documents_document_type_check check (document_type = any (array['certificate','transcript','degree','letter','id','enrollment','syllabus','resume'])),
  constraint documents_verification_status_check check (verification_status = any (array['pending','verified','rejected']))
);
create index idx_documents_org_status on public.documents (organization_id, verification_status);
create index idx_documents_student_id on public.documents (student_id);

-- ------------------------------------------------------------------ recruiter tables
create table public.recruiter_contacts (
  id uuid not null default gen_random_uuid() primary key,
  recruiter_id uuid not null references auth.users(id) on delete cascade,
  student_id uuid not null references auth.users(id) on delete cascade,
  contacted_at timestamptz default now(),
  method text default 'email',
  notes text,
  response_received boolean default false,
  response_at timestamptz,
  created_at timestamptz default now(),
  organization_id uuid references public.organizations(id) on delete cascade,
  constraint recruiter_contacts_method_check check (method = any (array['email','phone','linkedin','other']))
);
create index idx_recruiter_contacts_date on public.recruiter_contacts (contacted_at);
create index idx_recruiter_contacts_org_id on public.recruiter_contacts (organization_id);
create index idx_recruiter_contacts_recruiter on public.recruiter_contacts (recruiter_id);
create index idx_recruiter_contacts_recruiter_org on public.recruiter_contacts (recruiter_id, organization_id);
create index idx_recruiter_contacts_student on public.recruiter_contacts (student_id);

create table public.recruiter_favorites (
  id uuid not null default gen_random_uuid() primary key,
  recruiter_id uuid not null references auth.users(id) on delete cascade,
  student_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz default now(),
  organization_id uuid references public.organizations(id) on delete cascade,
  constraint unique_recruiter_favorite unique (recruiter_id, student_id)
);
create index idx_recruiter_favorites_org_id on public.recruiter_favorites (organization_id);
create index idx_recruiter_favorites_recruiter on public.recruiter_favorites (recruiter_id);
create index idx_recruiter_favorites_recruiter_org on public.recruiter_favorites (recruiter_id, organization_id);
create index idx_recruiter_favorites_student on public.recruiter_favorites (student_id);

create table public.recruiter_pipeline (
  id uuid not null default gen_random_uuid() primary key,
  recruiter_id uuid not null references auth.users(id) on delete cascade,
  student_id uuid not null references auth.users(id) on delete cascade,
  stage text not null,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  organization_id uuid references public.organizations(id) on delete cascade,
  constraint recruiter_pipeline_stage_check check (stage = any (array['shortlisted','contacted','interviewed','offered','rejected'])),
  constraint unique_recruiter_pipeline unique (recruiter_id, student_id)
);
create index idx_recruiter_pipeline_org_id on public.recruiter_pipeline (organization_id);
create index idx_recruiter_pipeline_recruiter on public.recruiter_pipeline (recruiter_id);
create index idx_recruiter_pipeline_recruiter_org on public.recruiter_pipeline (recruiter_id, organization_id);
create index idx_recruiter_pipeline_stage on public.recruiter_pipeline (stage);
create index idx_recruiter_pipeline_student on public.recruiter_pipeline (student_id);

create table public.recruiter_org_access (
  id uuid not null default gen_random_uuid() primary key,
  recruiter_user_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  status text not null default 'pending',
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recruiter_org_access_unique unique (recruiter_user_id, organization_id),
  constraint recruiter_org_access_status_check check (status = any (array['pending','approved','denied','revoked']))
);

-- ------------------------------------------------------------------ legacy: migration_status, verification_results, super_admin_audit
create table public.migration_status (
  id uuid not null default uuid_generate_v4() primary key,
  migration_name text not null,
  status text not null,
  started_at timestamptz,
  completed_at timestamptz,
  error_message text,
  metadata jsonb,
  created_at timestamptz not null default now(),
  constraint migration_status_migration_name_key unique (migration_name),
  constraint migration_status_status_check check (status = any (array['pending','in_progress','completed','failed']))
);
create table public.verification_results (
  id uuid not null default gen_random_uuid(),
  certificate_id uuid not null,
  is_verified boolean not null default false,
  confidence_score numeric(3,2) not null default 0.0,
  verification_method text not null,
  details jsonb not null default '{}'::jsonb,
  auto_approved boolean not null default false,
  requires_manual_review boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  organization_id uuid
);
create table public.super_admin_audit (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  target_resource text,
  access_reason text not null,
  category text not null,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint super_admin_audit_partitioned_category_check check (category = any (array['debug','support','compliance','security','maintenance'])),
  constraint super_admin_audit_partitioned_pkey primary key (id, created_at)
);

-- ------------------------------------------------------------------ functions (post-hardening state, 2026-10-14)
create function public.authz_role_rank(p_role text) returns int language sql immutable set search_path = public as $$
  select case p_role when 'super_admin' then 100 when 'org_admin' then 80 when 'admin' then 60 when 'faculty' then 40 when 'recruiter' then 20 when 'student' then 10 else 0 end $$;
create function public.authz_actor_rank(p_org uuid) returns int language sql stable security definer set search_path = public as $$
  select coalesce(max(case when r.role = 'super_admin' then 100 when r.organization_id is not distinct from p_org then public.authz_role_rank(r.role) else 0 end), 0)
  from public.user_roles r where r.user_id = auth.uid() and r.approval_status = 'approved' $$;
create function public.authz_has_role_row(p_org uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles r where r.user_id = auth.uid() and r.organization_id is not distinct from p_org) $$;
create function public.authz_is_super_admin() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles r where r.user_id = auth.uid() and r.role = 'super_admin' and r.approval_status = 'approved') $$;
create function public.is_super_admin_no_rls() returns boolean language plpgsql stable security definer set search_path = public as $$
begin return public.authz_is_super_admin(); exception when others then return false; end; $$;
create function public.is_org_admin_no_rls() returns boolean language plpgsql stable security definer set search_path = public as $$
begin return exists (select 1 from public.user_roles r where r.user_id = auth.uid() and r.role in ('org_admin','super_admin') and r.approval_status = 'approved'); exception when others then return false; end; $$;
create function public.get_user_org_id() returns uuid language plpgsql stable security definer set search_path = public as $$
declare org_id uuid; begin
  select r.organization_id into org_id from public.user_roles r where r.user_id = auth.uid() and r.approval_status = 'approved' order by public.authz_role_rank(r.role) desc, r.created_at asc limit 1;
  return org_id; exception when others then return null; end; $$;

create function public.update_organizations_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
create trigger set_organizations_updated_at before update on public.organizations for each row execute function public.update_organizations_updated_at();
create function public.update_recruiter_pipeline_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
create trigger trigger_update_recruiter_pipeline_updated_at before update on public.recruiter_pipeline for each row execute function public.update_recruiter_pipeline_updated_at();

create function public.auto_designate_first_admin() returns trigger language plpgsql security definer as $$
begin
  if new.role = 'admin' then
    if not exists (select 1 from public.user_roles where role = 'admin' and user_id != new.user_id) then
      new.is_super_admin := true;
    end if;
  end if;
  return new;
end; $$;
create trigger auto_designate_first_admin_trigger before insert on public.user_roles for each row execute function public.auto_designate_first_admin();

create function public.auto_designate_first_org_admin() returns trigger language plpgsql security definer as $$
begin
  if new.role = 'org_admin' and new.organization_id is not null then
    if not exists (select 1 from public.user_roles where organization_id = new.organization_id and is_primary_admin = true and user_id != new.user_id) then
      new.is_primary_admin := true;
    end if;
  end if;
  return new;
end; $$;
create trigger auto_designate_first_org_admin_trigger before insert on public.user_roles for each row execute function public.auto_designate_first_org_admin();

create function public.protect_primary_admin() returns trigger language plpgsql security definer as $$
declare is_super_admin boolean;
begin
  select exists(select 1 from public.user_roles where user_id = auth.uid() and role = 'super_admin') into is_super_admin;
  if is_super_admin then return new; end if;
  if tg_op = 'UPDATE' then
    if old.is_primary_admin = true then
      if new.role != 'org_admin' then raise exception 'Cannot demote primary administrator. Transfer primary admin status first.'; end if;
      if new.is_primary_admin = false then raise exception 'Cannot remove primary admin status directly. Use transfer function.'; end if;
      if new.organization_id != old.organization_id then raise exception 'Cannot move primary admin to different organization'; end if;
    end if;
  end if;
  if tg_op = 'DELETE' then
    if old.is_primary_admin = true then raise exception 'Cannot delete primary administrator. Transfer primary admin status first.'; end if;
    return old;
  end if;
  return new;
end; $$;
create trigger protect_primary_admin_trigger before update or delete on public.user_roles for each row execute function public.protect_primary_admin();

-- legacy leftovers (stubs with the live names/signatures so DROP FUNCTION can be tested)
create function public.drop_certificates_table() returns void language plpgsql security definer as $$ begin null; end $$;
create function public.mark_certificates_migrated() returns void language plpgsql security definer as $$ begin null; end $$;
create function public.is_certificates_migrated() returns boolean language plpgsql security definer as $$ begin return false; end $$;
create function public.enqueue_job(job_type text, job_payload jsonb, job_priority integer, job_max_retries integer, job_expires_at timestamptz) returns uuid language plpgsql security definer as $$ begin return null; end $$;
create function public.complete_job(job_id uuid, job_result jsonb, job_error text) returns void language plpgsql security definer as $$ begin null; end $$;
create function public.get_next_job() returns uuid language plpgsql security definer as $$ begin return null; end $$;
create function public.update_organization_usage_stats(org_id uuid) returns void language plpgsql security definer as $$ begin null; end $$;
create function public.update_faculty_approval(p_user_id uuid, p_organization_id uuid, p_new_status text, p_admin_id uuid, p_notes text) returns void language plpgsql security definer as $$ begin null; end $$;
create function public.ensure_student_role(p_user_id uuid) returns void language plpgsql security definer as $$ begin null; end $$;
create function public.get_super_admin() returns uuid language plpgsql security definer as $$ begin return null; end $$;
create function public.get_user_role(user_id_param uuid) returns text language plpgsql security definer as $$ begin return null; end $$;
create function public.get_pending_faculty_requests(org_id uuid) returns setof uuid language plpgsql security definer as $$ begin return; end $$;
create function public.get_user_accessible_orgs(user_uuid uuid) returns setof uuid language plpgsql security definer as $$ begin return; end $$;
create function public.can_access_org(user_uuid uuid, org_uuid uuid) returns boolean language plpgsql security definer as $$ begin return false; end $$;
create function public.check_recruiter_access(p_recruiter_id uuid, p_organization_id uuid) returns boolean language plpgsql security definer as $$ begin return false; end $$;
create function public.get_user_organization(p_user_id uuid) returns uuid language plpgsql security definer as $$ begin return null; end $$;
create function public.is_admin_no_rls() returns boolean language plpgsql security definer as $$ begin return false; end $$;
create function public.is_org_admin(p_user_id uuid, p_org_id uuid) returns boolean language plpgsql security definer as $$ begin return false; end $$;
create function public.is_organization_primary_admin(p_user_id uuid, org_id uuid) returns boolean language plpgsql security definer as $$ begin return false; end $$;
create function public.get_accuracy_metrics(days_back integer) returns void language plpgsql security definer as $$ begin null; end $$;
create function public.get_correction_stats(days_back integer) returns void language plpgsql security definer as $$ begin null; end $$;
create function public.create_next_month_partition() returns void language plpgsql as $$ begin null; end $$;
create function public.drop_old_audit_partitions() returns void language plpgsql as $$ begin null; end $$;
create function public.cleanup_org_access_on_platform_revoke() returns trigger language plpgsql security definer as $$ begin return new; end $$;
create function public.is_super_admin(p_user_id uuid) returns boolean language plpgsql security definer as $$ begin return false; end $$;
create function public.get_organization_primary_admin(org_id uuid) returns uuid language plpgsql security definer as $$ begin return null; end $$;
create function public.ensure_role(p_user_id uuid, p_role text) returns void language plpgsql security definer set search_path = public as $$ begin null; end $$;
create function public.check_and_reserve_slug(slug_to_check text) returns table(slug_exists boolean) language plpgsql security definer as $$ begin return query select exists (select 1 from public.organizations where slug = slug_to_check); end $$;
create function public.generate_organization_slug(org_name text) returns text language sql as $$ select lower(regexp_replace(org_name, '[^a-zA-Z0-9]+', '-', 'g')) $$;
create function public.transfer_primary_admin(from_user_id uuid, to_user_id uuid, org_id uuid) returns jsonb language plpgsql security definer as $$ begin return '{}'::jsonb; end $$;

-- ------------------------------------------------------------------ RLS (live state, abbreviated to the policies the migrations touch)
alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.role_requests enable row level security;
alter table public.allowed_domains enable row level security;
alter table public.trusted_issuers enable row level security;
alter table public.audit_logs enable row level security;
alter table public.certificates enable row level security;
alter table public.verifiable_credentials enable row level security;
alter table public.documents enable row level security;
alter table public.recruiter_contacts enable row level security;
alter table public.recruiter_favorites enable row level security;
alter table public.recruiter_pipeline enable row level security;
alter table public.recruiter_org_access enable row level security;
alter table public.migration_status enable row level security;
alter table public.verification_results enable row level security;

create policy "Admins can manage domains" on public.allowed_domains for all using (exists (select 1 from public.user_roles where user_id = auth.uid() and role = 'admin'));
create policy "Anyone can read active domains" on public.allowed_domains for select using (is_active = true);
create policy service_role_all_audit_logs on public.audit_logs for all to service_role using (true) with check (true);
create policy authenticated_insert_audit_logs on public.audit_logs for insert to authenticated with check (actor_id = auth.uid() or organization_id in (select organization_id from public.user_roles where user_id = auth.uid()));
create policy users_read_own_org_audit_logs on public.audit_logs for select to authenticated using (organization_id in (select organization_id from public.user_roles where user_id = auth.uid()));
create policy "Students can insert own certificates in org" on public.certificates for insert to authenticated
  with check (student_id = auth.uid() and coalesce(verification_status,'pending') = 'pending' and coalesce(status,'pending') = 'pending' and organization_id in (select ur.organization_id from public.user_roles ur where ur.user_id = auth.uid() and ur.approval_status = 'approved'));
create policy "Students can read own certificates in org" on public.certificates for select to authenticated using (student_id = auth.uid());
create policy "Org staff can update org certificates" on public.certificates for update to authenticated
  using (organization_id in (select ur.organization_id from public.user_roles ur where ur.user_id = auth.uid() and ur.role in ('admin','faculty','org_admin') and ur.approval_status = 'approved'))
  with check (organization_id in (select ur.organization_id from public.user_roles ur where ur.user_id = auth.uid() and ur.role in ('admin','faculty','org_admin') and ur.approval_status = 'approved'));
create policy service_role_all_vcs on public.verifiable_credentials for all to service_role using (true) with check (true);
create policy users_read_own_vcs on public.verifiable_credentials for select to authenticated using (student_id = auth.uid());
create policy users_insert_own_vcs on public.verifiable_credentials for insert to authenticated with check (student_id = auth.uid());
create policy "Users can read own role" on public.user_roles for select using (auth.uid() = user_id);
create policy "Super admins read all" on public.user_roles for select using (is_super_admin_no_rls());
create policy "Users can read their own profile" on public.profiles for select to authenticated using (id = auth.uid());
create policy "Users can update their own profile" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy "Users can insert their own profile" on public.profiles for insert to authenticated with check (id = auth.uid());
create policy "Users can read their own organization" on public.organizations for select to authenticated using (id in (select organization_id from public.user_roles where user_id = auth.uid()));
create policy authenticated_read_migration_status on public.migration_status for select to authenticated using (true);

-- ------------------------------------------------------------------ seed data mirroring the live row counts
insert into auth.users (id, email) values
 ('00000000-0000-4000-8000-00000000a001','owner@example.com'),
 ('00000000-0000-4000-8000-00000000a002','orgadmin1@example.com'),
 ('00000000-0000-4000-8000-00000000a003','orgadmin2@example.com'),
 ('00000000-0000-4000-8000-00000000a004','student1@university.edu'),
 ('00000000-0000-4000-8000-00000000a005','student2@university.edu'),
 ('11111111-1111-4111-8111-111111111111','faculty1@university.edu'),
 ('22222222-2222-4222-8222-222222222222','recruiter1@corp.com');
insert into public.organizations (id, name, slug, type, email, settings) values
 ('00000000-0000-4000-8000-00000000b001','Org A','org-a','university','a@a.edu','{"allowed_email_domains":["a.edu","*.a.edu"]}'),
 ('00000000-0000-4000-8000-00000000b002','Org B','org-b','institute','b@b.edu','{"allowed_email_domains":["b.edu"]}'),
 ('00000000-0000-0000-0000-000000000001','Default','default','university','d@d.edu', '{"allowed_email_domains":[]}');
insert into public.profiles (id, role, full_name, email, organization_id, company) values
 ('00000000-0000-4000-8000-00000000a001','admin','Owner','owner@example.com',null,null),
 ('00000000-0000-4000-8000-00000000a002','admin','OA1','orgadmin1@example.com','00000000-0000-4000-8000-00000000b001',null),
 ('00000000-0000-4000-8000-00000000a003','admin','OA2','orgadmin2@example.com','00000000-0000-4000-8000-00000000b002',null),
 ('00000000-0000-4000-8000-00000000a004','student','Student1','student1@university.edu','00000000-0000-4000-8000-00000000b001',null),
 ('00000000-0000-4000-8000-00000000a005','student','Student2','student2@university.edu','00000000-0000-4000-8000-00000000b001',null),
 ('11111111-1111-4111-8111-111111111111','student','Faculty1','faculty1@university.edu','00000000-0000-4000-8000-00000000b001',null),
 ('22222222-2222-4222-8222-222222222222','recruiter','Recruiter1','recruiter1@corp.com',null,'Corp');
-- is_super_admin only on the owner; trigger would otherwise fire, so disable user triggers while seeding
alter table public.user_roles disable trigger user;
insert into public.user_roles (user_id, role, organization_id, approval_status, is_super_admin, is_primary_admin, assigned_by) values
 ('00000000-0000-4000-8000-00000000a001','super_admin',null,'approved',true,false,'00000000-0000-4000-8000-00000000a001'),
 ('00000000-0000-4000-8000-00000000a002','org_admin','00000000-0000-4000-8000-00000000b001','approved',false,true,'00000000-0000-4000-8000-00000000a001'),
 ('00000000-0000-4000-8000-00000000a003','org_admin','00000000-0000-4000-8000-00000000b002','approved',false,true,'00000000-0000-4000-8000-00000000a001'),
 ('00000000-0000-4000-8000-00000000a004','student','00000000-0000-4000-8000-00000000b001','approved',false,false,null),
 ('00000000-0000-4000-8000-00000000a005','student','00000000-0000-4000-8000-00000000b001','approved',false,false,null),
 ('11111111-1111-4111-8111-111111111111','faculty','00000000-0000-4000-8000-00000000b001','approved',false,false,null),
 ('22222222-2222-4222-8222-222222222222','recruiter',null,'approved',false,false,null),
 ('22222222-2222-4222-8222-222222222222','recruiter','00000000-0000-4000-8000-00000000b001','approved',false,false,null);
alter table public.user_roles enable trigger user;

insert into public.certificates (id, student_id, file_url, status, verification_status, title, institution, date_issued, organization_id, faculty_id) values
 ('00000000-0000-4000-8000-00000000c001','00000000-0000-4000-8000-00000000a004','https://p.supabase.co/storage/v1/object/public/certificates/00000000-0000-4000-8000-00000000a004/1_a.pdf','pending','verified','Cloud 101','MIT','2024-05-01T00:00:00+00','00000000-0000-4000-8000-00000000b001',null),
 ('00000000-0000-4000-8000-00000000c002','00000000-0000-4000-8000-00000000a004','https://p.supabase.co/storage/v1/object/public/certificates/00000000-0000-4000-8000-00000000a004/2_b.pdf','pending','verified','AI 201','Stanford','2024-06-01T00:00:00+00','00000000-0000-4000-8000-00000000b001',null),
 ('00000000-0000-4000-8000-00000000c003','00000000-0000-4000-8000-00000000a004','https://p.supabase.co/storage/v1/object/public/certificates/00000000-0000-4000-8000-00000000a004/3_c.pdf','pending','verified','Data 301','CMU','2024-07-01T00:00:00+00','00000000-0000-4000-8000-00000000b001',null),
 ('00000000-0000-4000-8000-00000000c004','00000000-0000-4000-8000-00000000a005','https://p.supabase.co/storage/v1/object/public/certificates/00000000-0000-4000-8000-00000000a005/4_d.pdf','pending','verified','Web 101','Coursera','2024-08-01T00:00:00+00','00000000-0000-4000-8000-00000000b001',null),
 ('aaaaaaaa-0000-4000-8000-000000000005','00000000-0000-4000-8000-00000000a005','https://p.supabase.co/storage/v1/object/public/certificates/00000000-0000-4000-8000-00000000a005/5_e.pdf','pending','pending','Pending cert','Udemy','2024-09-01T00:00:00+00','00000000-0000-4000-8000-00000000b001',null),
 ('aaaaaaaa-0000-4000-8000-000000000006','00000000-0000-4000-8000-00000000a005','https://p.supabase.co/storage/v1/object/public/certificates/00000000-0000-4000-8000-00000000a005/6_f.pdf','rejected','rejected','Rejected cert','Udemy','2024-09-02T00:00:00+00','00000000-0000-4000-8000-00000000b001',null);

insert into public.verifiable_credentials (id, issuer, issuance_date, credential, student_id, status) values
 ('urn:uuid:11111111-aaaa-4aaa-8aaa-111111111111','did:web:x.test','2025-01-01T00:00:00Z','{"credentialSubject":{"certificateId":"00000000-0000-4000-8000-00000000c001"}}','00000000-0000-4000-8000-00000000a004','active'),
 ('urn:uuid:22222222-aaaa-4aaa-8aaa-222222222222','did:web:x.test','2025-01-02T00:00:00Z','{"credentialSubject":{"certificateId":"00000000-0000-4000-8000-00000000c002"}}','00000000-0000-4000-8000-00000000a004','active'),
 ('urn:uuid:33333333-aaaa-4aaa-8aaa-333333333333','did:web:x.test','2025-01-03T00:00:00Z','{"credentialSubject":{"certificateId":"00000000-0000-4000-8000-00000000c003"}}','00000000-0000-4000-8000-00000000a004','revoked'),
 ('urn:uuid:44444444-aaaa-4aaa-8aaa-444444444444','did:web:x.test','2025-01-04T00:00:00Z','{"credentialSubject":{"certificateId":"00000000-0000-4000-8000-00000000c004"}}','00000000-0000-4000-8000-00000000a005','active'),
 ('urn:uuid:55555555-aaaa-4aaa-8aaa-555555555555','did:web:x.test','2025-01-05T00:00:00Z','{"credentialSubject":{"certificateId":"deleted-cert-not-a-uuid"}}','00000000-0000-4000-8000-00000000a005','revoked');

insert into public.audit_logs (actor_id, action, target_id, target_user_id, organization_id, details) values
 ('00000000-0000-4000-8000-00000000a002','manual_approve','00000000-0000-4000-8000-00000000c001',null,'00000000-0000-4000-8000-00000000b001','{}'),
 ('00000000-0000-4000-8000-00000000a002','role_assign',null,'00000000-0000-4000-8000-00000000a004','00000000-0000-4000-8000-00000000b001','{}'),
 (null,'webhook_x',null,null,null,null);

insert into public.role_requests (user_id, requested_role, status, organization_id) values
 ('00000000-0000-4000-8000-00000000a004','faculty','pending','00000000-0000-4000-8000-00000000b001'),
 ('00000000-0000-4000-8000-00000000a005','recruiter','approved','00000000-0000-4000-8000-00000000b001');
insert into public.allowed_domains (domain) values ('.edu'),('ac.in'),('.ac.uk');
insert into public.trusted_issuers (name, domain) values ('Coursera','coursera.org'),('edX','edx.org');
insert into public.recruiter_pipeline (recruiter_id, student_id, stage, organization_id) values ('22222222-2222-4222-8222-222222222222','00000000-0000-4000-8000-00000000a004','shortlisted','00000000-0000-4000-8000-00000000b001');
insert into public.migration_status (migration_name, status) values ('certificates_to_documents','pending');
