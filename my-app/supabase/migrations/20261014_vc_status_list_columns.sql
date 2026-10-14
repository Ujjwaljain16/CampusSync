-- APPLIED to production (docs/DATABASE-SCHEMA.md, "Migration status"). Idempotent. (columns); the list table is in 20261014_vc_status_lists.sql.
--
-- Informational copy of a credential's status-list slot. The authoritative copy is the signed
-- `credentialStatus` entry inside the stored credential JSON, and the application works without
-- these columns (it ignores 42703 / PGRST204 when writing them).
-- Apply together with 20261014_vc_status_lists.sql.

alter table public.verifiable_credentials
  add column if not exists status_list_id text,
  add column if not exists status_list_index integer;

-- A slot is unique within its list.
create unique index if not exists verifiable_credentials_status_slot_idx
  on public.verifiable_credentials (status_list_id, status_list_index)
  where status_list_id is not null;
