-- Saved searches table for recruiters
create table if not exists public.saved_searches (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text null,
  filters jsonb not null,
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_saved_searches_user_id on public.saved_searches(user_id);
create index if not exists idx_saved_searches_public on public.saved_searches(is_public) where is_public = true;
create index if not exists idx_saved_searches_created_at on public.saved_searches(created_at);

alter table public.saved_searches enable row level security;

-- Users can view their own searches and public searches
do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='saved_searches' and policyname='Users can view own and public searches'
  ) then
    create policy "Users can view own and public searches" on public.saved_searches for select to authenticated
      using (user_id = auth.uid() or is_public = true);
  end if;
end $$;

-- Users can insert their own searches
do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='saved_searches' and policyname='Users can insert own searches'
  ) then
    create policy "Users can insert own searches" on public.saved_searches for insert to authenticated
      with check (user_id = auth.uid());
  end if;
end $$;

-- Users can update their own searches
do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='saved_searches' and policyname='Users can update own searches'
  ) then
    create policy "Users can update own searches" on public.saved_searches for update to authenticated
      using (user_id = auth.uid())
      with check (user_id = auth.uid());
  end if;
end $$;

-- Users can delete their own searches
do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='saved_searches' and policyname='Users can delete own searches'
  ) then
    create policy "Users can delete own searches" on public.saved_searches for delete to authenticated
      using (user_id = auth.uid());
  end if;
end $$;

-- Admins can manage all searches
do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='saved_searches' and policyname='Admins can manage all searches'
  ) then
    create policy "Admins can manage all searches" on public.saved_searches for all to authenticated
      using (exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role = 'admin'))
      with check (exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role = 'admin'));
  end if;
end $$;
