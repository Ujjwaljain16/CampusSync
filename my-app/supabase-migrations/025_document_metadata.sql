-- Document metadata table similar to certificate_metadata
create table if not exists public.document_metadata (
  id uuid primary key default uuid_generate_v4(),
  document_id uuid not null references public.documents(id) on delete cascade,
  ai_confidence_score numeric(4,3) null,
  verification_details jsonb null,
  extracted_fields jsonb null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_document_metadata_document_id on public.document_metadata(document_id);
alter table public.document_metadata enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='document_metadata' and policyname='Students read own doc metadata'
  ) then
    create policy "Students read own doc metadata"
      on public.document_metadata for select to authenticated
      using (exists (
        select 1 from public.documents d where d.id = document_id and (d.student_id = auth.uid() or exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role in ('admin','faculty','recruiter')))
      ));
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='document_metadata' and policyname='Admins/faculty insert doc metadata'
  ) then
    create policy "Admins/faculty insert doc metadata"
      on public.document_metadata for insert to authenticated
      with check (exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role in ('admin','faculty')));
  end if;
end $$;


