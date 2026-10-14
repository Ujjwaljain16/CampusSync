-- SUPERSEDED by vc_one_active_per_certificate in 20261015_03_indexes.sql. Idempotent.
--
-- Goal: at most ONE active verifiable credential per certificate.
-- Today `verifiable_credentials` has only a primary key (and a student_id FK), so concurrent
-- issue requests can create several active VCs for the same certificate.
--
-- Credential shape assumed (as written by /api/certificates/issue):
--   credential -> 'credentialSubject' ->> 'certificateId'
--
-- STEP 1 - find existing duplicates (run this first; the index below FAILS if any exist):
--
--   select credential->'credentialSubject'->>'certificateId' as certificate_id,
--          count(*)                                           as active_count,
--          array_agg(id order by created_at)                  as vc_ids
--   from public.verifiable_credentials
--   where status = 'active'
--   group by 1
--   having count(*) > 1;
--
-- STEP 2 - data fix suggestion (NOT run automatically; review each group by hand).
-- (Assumes a `created_at` column; adjust the ORDER BY to whatever the live table has.)
-- Keep the newest active VC per certificate and revoke the older ones. Requires the columns from
-- 20261014_core_vc_status_columns.sql (revoked_at / revoked_reason) to exist first.
--
--   update public.verifiable_credentials v
--   set status = 'revoked',
--       revoked_at = now(),
--       revoked_reason = 'superseded: duplicate active credential for certificate'
--   from (
--     select id,
--            row_number() over (
--              partition by credential->'credentialSubject'->>'certificateId'
--              order by created_at desc
--            ) as rn
--     from public.verifiable_credentials
--     where status = 'active'
--   ) d
--   where v.id = d.id and d.rn > 1;
--
-- STEP 3 - the constraint itself:

create unique index if not exists verifiable_credentials_one_active_per_certificate
  on public.verifiable_credentials ((credential->'credentialSubject'->>'certificateId'))
  where status = 'active';

-- After this lands, /api/certificates/issue should treat a unique_violation (SQLSTATE 23505)
-- as "credential already issued" and return the existing active VC instead of a 500.
