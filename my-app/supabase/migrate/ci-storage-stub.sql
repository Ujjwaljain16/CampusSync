-- CI ONLY. A minimal stand-in for the Supabase `storage` schema so that migrations touching storage.buckets and
-- storage.objects can be replayed on a plain PostgreSQL container (supabase/tests/live-schema.sql models the public
-- schema and auth only). Never applied to a real project; the runner does not pick this file up (it lives outside
-- supabase/migrations).
create schema if not exists storage;

create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  public boolean default false
);
insert into storage.buckets (id, name, public) values ('certificates', 'certificates', true)
  on conflict (id) do nothing;

create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text
);
alter table storage.objects enable row level security;

create or replace function storage.foldername(name text) returns text[]
  language sql immutable as $$
  select case when array_length(string_to_array(name, '/'), 1) > 1
    then (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
    else '{}'::text[] end
$$;
