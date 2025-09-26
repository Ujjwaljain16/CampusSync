-- Institution templates: logos/headers for authenticity checks
create table if not exists public.institution_templates (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  domain text null,
  logo_url text null,
  header_mask_url text null,
  metadata jsonb null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_institution_templates_name on public.institution_templates(name);

alter table public.institution_templates enable row level security;

-- Everyone can read templates
do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='institution_templates' and policyname='Anyone can read templates'
  ) then
    create policy "Anyone can read templates" on public.institution_templates for select using (true);
  end if;
end $$;

-- Only admins can insert/update
do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='institution_templates' and policyname='Admins can write templates'
  ) then
    create policy "Admins can write templates" on public.institution_templates for all to authenticated
      using (exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role = 'admin'))
      with check (exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role = 'admin'));
  end if;
end $$;


