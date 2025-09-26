-- Job queue for background OCR/verification processing
create table if not exists public.job_queue (
  id uuid primary key default uuid_generate_v4(),
  type text not null check (type in ('ocr', 'verification', 'normalization')),
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'failed')),
  priority integer not null default 0,
  payload jsonb not null,
  result jsonb null,
  error text null,
  retry_count integer not null default 0,
  max_retries integer not null default 3,
  created_at timestamptz not null default now(),
  started_at timestamptz null,
  completed_at timestamptz null,
  expires_at timestamptz null
);

create index if not exists idx_job_queue_status_priority on public.job_queue(status, priority desc, created_at);
create index if not exists idx_job_queue_type on public.job_queue(type);
create index if not exists idx_job_queue_expires on public.job_queue(expires_at) where expires_at is not null;

alter table public.job_queue enable row level security;

-- Only admins and faculty can manage jobs
do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='job_queue' and policyname='Admins and faculty can manage jobs'
  ) then
    create policy "Admins and faculty can manage jobs" on public.job_queue for all to authenticated
      using (exists (
        select 1 from public.user_roles ur 
        where ur.user_id = auth.uid() 
        and ur.role in ('admin', 'faculty')
      ))
      with check (exists (
        select 1 from public.user_roles ur 
        where ur.user_id = auth.uid() 
        and ur.role in ('admin', 'faculty')
      ));
  end if;
end $$;

-- Job status tracking
create table if not exists public.job_status (
  id uuid primary key default uuid_generate_v4(),
  job_id uuid not null references public.job_queue(id) on delete cascade,
  status text not null,
  message text null,
  metadata jsonb null,
  created_at timestamptz not null default now()
);

create index if not exists idx_job_status_job_id on public.job_status(job_id);
create index if not exists idx_job_status_created_at on public.job_status(created_at);

alter table public.job_status enable row level security;

-- Inherit same policy as job_queue
do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='job_status' and policyname='Admins and faculty can manage job status'
  ) then
    create policy "Admins and faculty can manage job status" on public.job_status for all to authenticated
      using (exists (
        select 1 from public.user_roles ur 
        where ur.user_id = auth.uid() 
        and ur.role in ('admin', 'faculty')
      ))
      with check (exists (
        select 1 from public.user_roles ur 
        where ur.user_id = auth.uid() 
        and ur.role in ('admin', 'faculty')
      ));
  end if;
end $$;

-- RPC functions for job management
create or replace function public.enqueue_job(
  job_type text,
  job_payload jsonb,
  job_priority integer default 0,
  job_max_retries integer default 3,
  job_expires_at timestamptz default null
) returns uuid as $$
declare
  job_id uuid;
begin
  insert into public.job_queue (type, priority, payload, max_retries, expires_at)
  values (job_type, job_priority, job_payload, job_max_retries, job_expires_at)
  returning id into job_id;
  
  return job_id;
end;
$$ language plpgsql security definer;

create or replace function public.get_next_job() returns table(
  id uuid,
  type text,
  payload jsonb,
  retry_count integer,
  max_retries integer
) as $$
begin
  return query
  update public.job_queue
  set status = 'processing',
      started_at = now(),
      retry_count = retry_count + 1
  where id = (
    select jq.id
    from public.job_queue jq
    where jq.status = 'pending'
      and (jq.expires_at is null or jq.expires_at > now())
    order by jq.priority desc, jq.created_at
    limit 1
    for update skip locked
  )
  returning job_queue.id, job_queue.type, job_queue.payload, job_queue.retry_count, job_queue.max_retries;
end;
$$ language plpgsql security definer;

create or replace function public.complete_job(
  job_id uuid,
  job_result jsonb default null,
  job_error text default null
) returns void as $$
begin
  update public.job_queue
  set status = case when job_error is null then 'completed' else 'failed' end,
      result = job_result,
      error = job_error,
      completed_at = now()
  where id = job_id;
  
  -- Log status
  insert into public.job_status (job_id, status, message, metadata)
  values (
    job_id,
    case when job_error is null then 'completed' else 'failed' end,
    job_error,
    job_result
  );
end;
$$ language plpgsql security definer;
