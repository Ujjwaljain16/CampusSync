-- Schema cleanup, step 6 of 8: CREDENTIALS ARE ISSUED AND REVOKED BY THE BACKEND ONLY.
-- *** APPLY ONLY AFTER the application change below is deployed. ***  DRAFT. Idempotent; one transaction.
-- Plain ASCII on purpose.
--
-- Requires (application change): issueCredentialForCertificate and the revoke paths must write to
-- verifiable_credentials with the service-role client AFTER their own authorization checks. Today both issue routes pass
-- the signed-in user's client, so issuance only works because of the owner-insert policy dropped here.
--
-- What this does
--   * A signed-in user can no longer insert a credential row for themselves. The row is the thing every verifier
--     reads (the display fields come from it), and forging one that carries a different signed JSON is exactly what
--     the database should refuse; the signature check would catch it, but the row should never exist.
--   * Updates (revocation) stay restricted to approved staff of the owner's organization, as in the hardening step.

begin;

drop policy if exists users_insert_own_vcs on public.verifiable_credentials;
revoke insert, delete, truncate on public.verifiable_credentials from anon, authenticated;
revoke all on public.verifiable_credentials from anon;

commit;
