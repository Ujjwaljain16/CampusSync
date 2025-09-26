-- Metrics and monitoring tables for accuracy tracking
create table if not exists public.verification_metrics (
  id uuid primary key default uuid_generate_v4(),
  document_id uuid references public.documents(id) on delete cascade,
  job_id uuid references public.job_queue(id) on delete set null,
  metric_type text not null check (metric_type in ('accuracy', 'confidence', 'processing_time', 'error_rate')),
  metric_value numeric not null,
  metadata jsonb null,
  created_at timestamptz not null default now()
);

create index if not exists idx_verification_metrics_type on public.verification_metrics(metric_type);
create index if not exists idx_verification_metrics_created_at on public.verification_metrics(created_at);
create index if not exists idx_verification_metrics_document_id on public.verification_metrics(document_id);

-- Human corrections for active learning
create table if not exists public.human_corrections (
  id uuid primary key default uuid_generate_v4(),
  document_id uuid references public.documents(id) on delete cascade,
  field_name text not null,
  original_value text not null,
  corrected_value text not null,
  correction_type text not null check (correction_type in ('field_extraction', 'normalization', 'verification_decision')),
  corrected_by uuid references auth.users(id) on delete set null,
  confidence_before numeric null,
  confidence_after numeric null,
  metadata jsonb null,
  created_at timestamptz not null default now()
);

create index if not exists idx_human_corrections_document_id on public.human_corrections(document_id);
create index if not exists idx_human_corrections_type on public.human_corrections(correction_type);
create index if not exists idx_human_corrections_created_at on public.human_corrections(created_at);

-- System performance metrics
create table if not exists public.system_metrics (
  id uuid primary key default uuid_generate_v4(),
  metric_name text not null,
  metric_value numeric not null,
  metric_unit text null,
  tags jsonb null,
  timestamp timestamptz not null default now()
);

create index if not exists idx_system_metrics_name on public.system_metrics(metric_name);
create index if not exists idx_system_metrics_timestamp on public.system_metrics(timestamp);

-- Enable RLS
alter table public.verification_metrics enable row level security;
alter table public.human_corrections enable row level security;
alter table public.system_metrics enable row level security;

-- RLS policies
do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='verification_metrics' and policyname='Admins and faculty can view metrics'
  ) then
    create policy "Admins and faculty can view metrics" on public.verification_metrics for select to authenticated
      using (exists (
        select 1 from public.user_roles ur 
        where ur.user_id = auth.uid() 
        and ur.role in ('admin', 'faculty')
      ));
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='human_corrections' and policyname='Users can view own corrections'
  ) then
    create policy "Users can view own corrections" on public.human_corrections for select to authenticated
      using (corrected_by = auth.uid() or exists (
        select 1 from public.user_roles ur 
        where ur.user_id = auth.uid() 
        and ur.role in ('admin', 'faculty')
      ));
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='human_corrections' and policyname='Users can insert corrections'
  ) then
    create policy "Users can insert corrections" on public.human_corrections for insert to authenticated
      with check (corrected_by = auth.uid());
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='system_metrics' and policyname='Admins can view system metrics'
  ) then
    create policy "Admins can view system metrics" on public.system_metrics for select to authenticated
      using (exists (
        select 1 from public.user_roles ur 
        where ur.user_id = auth.uid() 
        and ur.role = 'admin'
      ));
  end if;
end $$;

-- RPC functions for metrics
create or replace function public.get_accuracy_metrics(
  days_back integer default 30
) returns table(
  metric_type text,
  avg_value numeric,
  min_value numeric,
  max_value numeric,
  count bigint,
  date_bucket date
) as $$
begin
  return query
  select 
    vm.metric_type,
    avg(vm.metric_value) as avg_value,
    min(vm.metric_value) as min_value,
    max(vm.metric_value) as max_value,
    count(*) as count,
    date(vm.created_at) as date_bucket
  from public.verification_metrics vm
  where vm.created_at >= now() - interval '1 day' * days_back
  group by vm.metric_type, date(vm.created_at)
  order by date_bucket desc, vm.metric_type;
end;
$$ language plpgsql security definer;

create or replace function public.get_correction_stats(
  days_back integer default 30
) returns table(
  correction_type text,
  total_corrections bigint,
  avg_confidence_improvement numeric,
  most_corrected_field text
) as $$
begin
  return query
  select 
    hc.correction_type,
    count(*) as total_corrections,
    avg(hc.confidence_after - hc.confidence_before) as avg_confidence_improvement,
    mode() within group (order by hc.field_name) as most_corrected_field
  from public.human_corrections hc
  where hc.created_at >= now() - interval '1 day' * days_back
  group by hc.correction_type
  order by total_corrections desc;
end;
$$ language plpgsql security definer;
