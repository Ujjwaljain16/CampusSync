-- Deprecate certificates table and related functions
-- This migration should be run AFTER data migration is complete

-- Add deprecation notice to certificates table
comment on table public.certificates is 'DEPRECATED: Use documents table instead. This table will be removed in a future version.';

-- Create a view for backward compatibility (temporary)
create or replace view public.certificates_view as
select 
  d.id,
  d.student_id,
  d.user_id,
  d.document_type,
  d.title,
  d.institution,
  d.issue_date,
  d.file_url,
  d.ocr_text,
  d.ocr_confidence,
  d.verification_status,
  d.metadata,
  d.created_at,
  d.updated_at,
  dm.ai_confidence_score,
  dm.verification_details
from public.documents d
left join public.document_metadata dm on d.id = dm.document_id
where d.document_type = 'certificate';

-- Update RLS policies to redirect to documents
do $$ begin
  -- Drop old policies
  drop policy if exists "Users can view own certificates" on public.certificates;
  drop policy if exists "Users can insert own certificates" on public.certificates;
  drop policy if exists "Users can update own certificates" on public.certificates;
  drop policy if exists "Users can delete own certificates" on public.certificates;
  drop policy if exists "Faculty can view all certificates" on public.certificates;
  drop policy if exists "Admins can manage all certificates" on public.certificates;
  
  -- Add deprecation policies that redirect to documents
  create policy "Certificates deprecated - use documents" on public.certificates for all to authenticated
    using (false)
    with check (false);
end $$;

-- Create migration status table
create table if not exists public.migration_status (
  id uuid primary key default uuid_generate_v4(),
  migration_name text not null unique,
  status text not null check (status in ('pending', 'in_progress', 'completed', 'failed')),
  started_at timestamptz null,
  completed_at timestamptz null,
  error_message text null,
  metadata jsonb null,
  created_at timestamptz not null default now()
);

-- Insert migration status
insert into public.migration_status (migration_name, status, metadata)
values (
  'certificates_to_documents',
  'pending',
  jsonb_build_object(
    'description', 'Migration from certificates table to documents table',
    'version', '1.0',
    'deprecation_date', '2024-01-01'
  )
)
on conflict (migration_name) do nothing;

-- Function to check if migration is complete
create or replace function public.is_certificates_migrated()
returns boolean as $$
begin
  return exists (
    select 1 from public.migration_status 
    where migration_name = 'certificates_to_documents' 
    and status = 'completed'
  );
end;
$$ language plpgsql security definer;

-- Function to mark migration as complete
create or replace function public.mark_certificates_migrated()
returns void as $$
begin
  update public.migration_status
  set status = 'completed',
      completed_at = now()
  where migration_name = 'certificates_to_documents';
end;
$$ language plpgsql security definer;

-- Function to safely drop certificates table (admin only)
create or replace function public.drop_certificates_table()
returns void as $$
begin
  -- Check if migration is complete
  if not public.is_certificates_migrated() then
    raise exception 'Cannot drop certificates table: migration not complete';
  end if;
  
  -- Check if user is admin
  if not exists (
    select 1 from public.user_roles ur 
    where ur.user_id = auth.uid() 
    and ur.role = 'admin'
  ) then
    raise exception 'Only admins can drop the certificates table';
  end if;
  
  -- Drop the table
  drop table if exists public.certificates cascade;
  
  -- Update migration status
  update public.migration_status
  set metadata = metadata || jsonb_build_object('table_dropped', true, 'dropped_at', now())
  where migration_name = 'certificates_to_documents';
end;
$$ language plpgsql security definer;
