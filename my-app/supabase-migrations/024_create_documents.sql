-- Create generic documents table for all academic documents
create table if not exists public.documents (
  id uuid primary key default uuid_generate_v4(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  document_type text not null check (document_type in (
    'certificate','transcript','degree','letter','id','enrollment','syllabus','resume'
  )),
  title text not null,
  institution text null,
  issue_date date null,
  file_url text not null,
  ocr_text text null,
  ocr_confidence numeric(4,3) null,
  verification_status text not null default 'pending' check (verification_status in ('pending','verified','rejected')),
  metadata jsonb null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_documents_student_id on public.documents(student_id);
create index if not exists idx_documents_document_type on public.documents(document_type);
create index if not exists idx_documents_status on public.documents(verification_status);
create index if not exists idx_documents_created_at on public.documents(created_at desc);

-- Enable RLS
alter table public.documents enable row level security;

-- Policies
do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='documents' and policyname='Students can select own documents'
  ) then
    create policy "Students can select own documents"
      on public.documents for select to authenticated
      using (auth.uid() = student_id or exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role in ('admin','faculty','recruiter')));
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='documents' and policyname='Students can insert own documents'
  ) then
    create policy "Students can insert own documents"
      on public.documents for insert to authenticated
      with check (auth.uid() = student_id and auth.uid() = user_id);
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='documents' and policyname='Students can update own documents'
  ) then
    create policy "Students can update own documents"
      on public.documents for update to authenticated
      using (auth.uid() = student_id)
      with check (auth.uid() = student_id);
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='documents' and policyname='Admins and faculty can update documents'
  ) then
    create policy "Admins and faculty can update documents"
      on public.documents for update to authenticated
      using (exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role in ('admin','faculty')))
      with check (true);
  end if;
end $$;


