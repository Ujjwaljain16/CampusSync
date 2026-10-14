-- Schema cleanup, step 6 of 8: CREDENTIALS ARE ISSUED AND REVOKED BY THE BACKEND ONLY.
-- *** APPLY ONLY AFTER the application change below is deployed. ***  DRAFT. Idempotent; one transaction.
-- Plain ASCII on purpose.
--
-- Requires (application change): issueCredentialForCertificate and the revoke paths write to verifiable_credentials with
-- the service-role client AFTER their own authorization checks. Apply this file only after that code is deployed.
--
-- What this does
--   * Credential rows are written by the backend only; signed-in users no longer insert them directly.
--   * Updates (revocation) stay restricted to approved staff of the owner's organization.

begin;

drop policy if exists users_insert_own_vcs on public.verifiable_credentials;
revoke insert, delete, truncate on public.verifiable_credentials from anon, authenticated;
revoke all on public.verifiable_credentials from anon;

commit;
