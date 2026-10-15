-- migrate: baseline
-- Schema cleanup, step 3b: drop credential indexes that step 03's new ones make redundant.
-- Idempotent; one transaction. Plain ASCII on purpose. Safe to apply right after 20261015_03.
--
-- The production table still carries five older indexes on verifiable_credentials that the test model did not have.
-- Every query in the application filters credentials by id, by (student_id, status), by certificate_id or by
-- organization_id; those are covered by verifiable_credentials_student_status_idx, verifiable_credentials_certificate_idx,
-- vc_one_active_per_certificate and verifiable_credentials_org_idx (all created in step 03).

begin;

drop index if exists public.idx_verifiable_credentials_student_id;        -- prefix of verifiable_credentials_student_status_idx
drop index if exists public.idx_verifiable_credentials_student_status;    -- same columns as verifiable_credentials_student_status_idx
drop index if exists public.idx_verifiable_credentials_status;            -- a handful of distinct values
drop index if exists public.idx_verifiable_credentials_issuer;            -- never filtered on
drop index if exists public.idx_verifiable_credentials_issuance_date;     -- ordering happens on a handful of rows per certificate

-- trusted_issuers: the organization column is the leading column of the unique (organization_id, name) index
drop index if exists public.idx_trusted_issuers_organization_id;

commit;
