-- DRAFT — review against the live schema before applying; idempotent
--
-- Application code (/api/vcs/revoke, /api/vcs/verify, /api/certificates/revert-approval,
-- /api/documents/revoke) reads/writes verifiable_credentials.status, revoked_at and revoked_reason.
-- Those columns may already exist in the live database, hence `add column if not exists`.

alter table public.verifiable_credentials
  add column if not exists revoked_at timestamptz,
  add column if not exists revoked_reason text;

-- Restrict status to the two values the code uses. NOT VALID: existing rows are not scanned, so this
-- cannot fail on legacy data; new/updated rows are checked. Validate later with:
--   alter table public.verifiable_credentials validate constraint verifiable_credentials_status_check;
-- (first check:  select distinct status from public.verifiable_credentials;)
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'verifiable_credentials_status_check'
      and conrelid = 'public.verifiable_credentials'::regclass
  ) then
    alter table public.verifiable_credentials
      add constraint verifiable_credentials_status_check
      check (status in ('active', 'revoked')) not valid;
  end if;
end
$$;
