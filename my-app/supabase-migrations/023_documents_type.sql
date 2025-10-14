-- Add document_type to certificates for multi-document support
alter table if exists public.certificates
  add column if not exists document_type text check (document_type in (
    'certificate','transcript','degree','letter','id','enrollment','syllabus','resume'
  )) default 'certificate';

create index if not exists idx_certificates_document_type on public.certificates(document_type);


