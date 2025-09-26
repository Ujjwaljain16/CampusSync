-- 020_role_requests_rls.sql
-- Enable RLS on role_requests and add minimal policies

alter table if exists public.role_requests enable row level security;

-- Requester can view their own requests
do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='role_requests' and policyname='role_requests_select_own'
  ) then
    create policy role_requests_select_own on public.role_requests
      for select to authenticated
      using (user_id = auth.uid());
  end if;
end $$;

-- Admins can view all requests
do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='role_requests' and policyname='role_requests_select_admin'
  ) then
    create policy role_requests_select_admin on public.role_requests
      for select to authenticated
      using (exists (
        select 1 from public.user_roles ur
        where ur.user_id = auth.uid() and ur.role = 'admin'
      ));
  end if;
end $$;

-- Requester can create their own request
do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='role_requests' and policyname='role_requests_insert_self'
  ) then
    create policy role_requests_insert_self on public.role_requests
      for insert to authenticated
      with check (user_id = auth.uid());
  end if;
end $$;

-- Admins can update (approve/deny) any request
do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='role_requests' and policyname='role_requests_update_admin'
  ) then
    create policy role_requests_update_admin on public.role_requests
      for update to authenticated
      using (exists (
        select 1 from public.user_roles ur
        where ur.user_id = auth.uid() and ur.role = 'admin'
      ))
      with check (exists (
        select 1 from public.user_roles ur
        where ur.user_id = auth.uid() and ur.role = 'admin'
      ));
  end if;
end $$;


