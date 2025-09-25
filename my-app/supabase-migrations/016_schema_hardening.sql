-- 016_schema_hardening.sql
-- Purpose: Add indexes, constraints, helper RPC for default student role, and recruiter summary view

-- 1) Indexes for common queries
create index if not exists idx_certificates_student_status on public.certificates (student_id, verification_status);
create index if not exists idx_certificates_user_verified on public.certificates (user_id) where verification_status = 'verified';
create index if not exists idx_certificates_date_issued on public.certificates (date_issued);
create index if not exists idx_audit_logs_target_created on public.audit_logs (target_id, created_at);

-- 2) Enforce sane uniqueness on roles (allows multiple roles per user, but no duplicates)
do $$ begin
  if not exists (
    select 1 from pg_indexes where schemaname = 'public' and indexname = 'user_roles_user_role_unique'
  ) then
    create unique index user_roles_user_role_unique on public.user_roles (user_id, role);
  end if;
end $$;

-- 3) Helper RPC to assign default 'student' role without client-side RLS issues
-- SECURITY DEFINER to bypass RLS safely; limit execute to authenticated role
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

-- 4) Recruiter-friendly summarized view for fast search/list pages
create or replace view public.recruiter_student_summary as
select
  p.id as user_id,
  coalesce(p.full_name, '') as full_name,
  -- counts
  sum(case when c.verification_status = 'verified' then 1 else 0 end) as verified_certifications,
  count(c.id) as total_certifications,
  max(c.created_at) as last_activity,
  -- simple derivations
  min(c.institution) filter (where c.institution is not null) as sample_institution
from public.profiles p
left join public.certificates c on c.student_id = p.id
group by p.id, p.full_name;

-- Optional: you can add RLS policies on this view if needed using security barrier views, omitted here


