-- Verification requests table for webhook tracking
create table if not exists public.verification_requests (
  id uuid primary key default uuid_generate_v4(),
  credential_id text not null,
  requester_id uuid references auth.users(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'failed')),
  verification_method text null,
  confidence_score numeric null,
  error_message text null,
  webhook_data jsonb null,
  created_at timestamptz not null default now(),
  completed_at timestamptz null
);

create index if not exists idx_verification_requests_credential_id on public.verification_requests(credential_id);
create index if not exists idx_verification_requests_status on public.verification_requests(status);
create index if not exists idx_verification_requests_created_at on public.verification_requests(created_at);

alter table public.verification_requests enable row level security;

-- Users can view their own verification requests
do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='verification_requests' and policyname='Users can view own verification requests'
  ) then
    create policy "Users can view own verification requests" on public.verification_requests for select to authenticated
      using (requester_id = auth.uid());
  end if;
end $$;

-- Users can create verification requests
do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='verification_requests' and policyname='Users can create verification requests'
  ) then
    create policy "Users can create verification requests" on public.verification_requests for insert to authenticated
      with check (requester_id = auth.uid());
  end if;
end $$;

-- Admins and faculty can view all verification requests
do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='verification_requests' and policyname='Admins and faculty can view all verification requests'
  ) then
    create policy "Admins and faculty can view all verification requests" on public.verification_requests for select to authenticated
      using (exists (
        select 1 from public.user_roles ur 
        where ur.user_id = auth.uid() 
        and ur.role in ('admin', 'faculty')
      ));
  end if;
end $$;

-- System can update verification requests (for webhooks)
do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='verification_requests' and policyname='System can update verification requests'
  ) then
    create policy "System can update verification requests" on public.verification_requests for update to authenticated
      using (true)
      with check (true);
  end if;
end $$;
