-- Schema cleanup, step 5 of 8: LOCK AUDIT WRITES. *** APPLY ONLY AFTER the application change below is deployed. ***
-- APPLIED to production 2026-10-15. Idempotent; one transaction. Plain ASCII on purpose.
--
-- Requires (application change): every audit_logs INSERT goes through the service-role client (writeAudit in
-- src/lib/api/utils/audit.ts does this). Apply this file only after that code is deployed, otherwise audit rows from
-- the older code paths would be refused.
--
-- What this does
--   * Only the backend writes audit_logs.
--   * Reading: a user sees the rows they caused, an admin of an organization (admin or above) sees that organization's
--     rows, a super admin sees everything including platform-level events (organization_id is NULL).

begin;

drop policy if exists authenticated_insert_audit_logs on public.audit_logs;
drop policy if exists users_read_own_org_audit_logs on public.audit_logs;
drop policy if exists audit_logs_read on public.audit_logs;

create policy audit_logs_read on public.audit_logs
  for select to authenticated
  using (actor_id = (select auth.uid()) or public.authz_actor_rank(organization_id) >= 60);

revoke insert, update, delete, truncate on public.audit_logs from anon, authenticated;
revoke all on public.audit_logs from anon;
grant select on public.audit_logs to authenticated;

commit;
