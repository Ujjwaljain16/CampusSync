-- DRAFT - review against the live schema before applying; idempotent
--
-- PROPOSAL: normalize `audit_logs` so every insert in the app resolves.
-- Routes currently write the actor under two different names (`user_id` in some, `actor_id` in others)
-- and the subject under `target_id`, `entity_id` or `resource_id`. Because PostgREST rejects unknown
-- columns, an insert using a column the table lacks fails - and most call sites ignore the error, so
-- audit rows are silently lost. First, inspect what the live table has:
--
--   select column_name, data_type, is_nullable
--   from information_schema.columns
--   where table_schema = 'public' and table_name = 'audit_logs'
--   order by ordinal_position;
--
-- Columns referenced by the code today (grep of .from('audit_logs')):
--   user_id, actor_id, organization_id, action, target_id, entity_type, entity_id,
--   resource_type, resource_id, details, metadata, created_at
--
-- This draft adds ONLY the canonical set, and ONLY when absent.
-- Preferred long-term fix: change the call sites to one shape (actor_id, target_type, target_id,
-- organization_id, details) rather than widening the table further.

alter table public.audit_logs
  add column if not exists actor_id        uuid,
  add column if not exists target_type     text,
  add column if not exists target_id       text,
  add column if not exists organization_id uuid,
  add column if not exists details         jsonb;

-- Optional (uncomment ONLY if you decide to keep the legacy write shapes working):
--   alter table public.audit_logs
--     add column if not exists user_id       uuid,
--     add column if not exists entity_type   text,
--     add column if not exists entity_id     text,
--     add column if not exists resource_type text,
--     add column if not exists resource_id   text,
--     add column if not exists metadata      jsonb;

-- Optional backfill if both user_id and actor_id exist (review before running):
--   update public.audit_logs set actor_id = user_id where actor_id is null and user_id is not null;

-- Reads that need to resolve either style can go through a view instead of touching the table:
--   create or replace view public.audit_logs_normalized as
--   select id, created_at, action, organization_id, details,
--          coalesce(actor_id, user_id)                         as actor_id,
--          coalesce(target_type, entity_type, resource_type)   as target_type,
--          coalesce(target_id, entity_id, resource_id)         as target_id
--   from public.audit_logs;
--   -- (only valid once all referenced columns exist; set security_invoker = true on PG15+)

-- NOTE: RLS policies for audit_logs are not covered here and are not in this repository.
