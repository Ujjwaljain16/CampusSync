-- 017_schema_mitigation.sql
-- Safe, idempotent hardening to align the schema with app needs
-- Run in Supabase SQL editor or psql; re-runnable without harm

-- 0) Profiles: ensure optional student fields exist (all NULLable for safety)
alter table if exists public.profiles add column if not exists avatar_url text;
alter table if exists public.profiles add column if not exists university text;
alter table if exists public.profiles add column if not exists graduation_year int;
alter table if exists public.profiles add column if not exists major text;
alter table if exists public.profiles add column if not exists location text;
alter table if exists public.profiles add column if not exists gpa numeric(3,2);
alter table if exists public.profiles add column if not exists created_at timestamptz default now();

-- 1) Certificates: performance indexes
create index if not exists idx_certificates_student_status on public.certificates (student_id, verification_status);
create index if not exists idx_certificates_user_verified on public.certificates (user_id) where verification_status = 'verified';
create index if not exists idx_certificates_date_issued on public.certificates (date_issued);

-- 2) Audit logs: quick lookups
create index if not exists idx_audit_logs_target_created on public.audit_logs (target_id, created_at);

-- 3) Roles: prevent duplicates per user
do $$ begin
  if not exists (
    select 1 from pg_indexes where schemaname = 'public' and indexname = 'user_roles_user_role_unique'
  ) then
    create unique index user_roles_user_role_unique on public.user_roles (user_id, role);
  end if;
end $$;

-- 4) RPC to safely ensure default student role without client RLS writes
create or replace function public.ensure_student_role(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_roles (user_id, role, assigned_by)
  select p_user_id, 'student', p_user_id
  where not exists (
    select 1 from public.user_roles ur where ur.user_id = p_user_id and ur.role = 'student'
  );
end;
$$;

revoke all on function public.ensure_student_role(uuid) from public;
grant execute on function public.ensure_student_role(uuid) to authenticated;

-- 5) Recruiter-friendly summary view (fast list pages)
create or replace view public.recruiter_student_summary as
select
  p.id as user_id,
  coalesce(p.full_name, '') as full_name,
  sum(case when c.verification_status = 'verified' then 1 else 0 end) as verified_certifications,
  count(c.id) as total_certifications,
  max(c.created_at) as last_activity,
  min(c.institution) filter (where c.institution is not null) as sample_institution
from public.profiles p
left join public.certificates c on c.student_id = p.id
group by p.id, p.full_name;

-- (Optional) Add text search support later (GIN index on derived tsvector), omitted for safety

-- NOTE: RLS policies are not modified here to avoid conflicts with existing rules.
-- App now calls ensure_student_role(uuid) during signup completion to avoid direct user_roles writes.


