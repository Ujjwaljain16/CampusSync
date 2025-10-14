-- VC Status Registry (revocation/suspension/expiration)
-- Idempotent migration

create table if not exists public.vc_status_registry (
    id uuid primary key default uuid_generate_v4(),
    credential_id text not null, -- VC id can be urn:uuid:...
    status text not null check (status in ('active','revoked','suspended','expired')),
    reason_code text null,
    reason text null,
    issuer text null,
    subject_id uuid null,
    recorded_at timestamptz not null default now(),
    recorded_by uuid null references public.profiles(id) on delete set null,
    metadata jsonb null
);

-- Speed up lookups by credential and latest status
create index if not exists idx_vc_status_registry_credential on public.vc_status_registry(credential_id);
create index if not exists idx_vc_status_registry_recorded_at on public.vc_status_registry(recorded_at desc);

-- RLS
alter table public.vc_status_registry enable row level security;

-- Readers: everyone can read status for verification
do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'vc_status_registry' and policyname = 'Anyone can read vc status'
  ) then
    create policy "Anyone can read vc status"
      on public.vc_status_registry for select
      using (true);
  end if;
end $$;

-- Writers: only admins and faculty can write (revoke/suspend)
do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'vc_status_registry' and policyname = 'Admins and faculty can write vc status'
  ) then
    create policy "Admins and faculty can write vc status"
      on public.vc_status_registry for insert to authenticated
      with check (
        exists (select 1 from public.user_roles where user_id = auth.uid() and role in ('admin','faculty'))
      );
  end if;
end $$;


