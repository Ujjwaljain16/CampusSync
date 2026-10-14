-- Schema cleanup, step 5 of 8: LOCK AUDIT WRITES. *** APPLY ONLY AFTER the application change below is deployed. ***
-- DRAFT. Idempotent; one transaction. Plain ASCII on purpose.
--
-- Requires (application change): every audit_logs INSERT must go through the service-role client. Today a few
-- writers still use the signed-in user's session: certificateService (writeAudit(db, ...)), vcs/revoke,
-- certificates/delete, credentials/sd/issue and the documents routes. Their inserts only succeed because the table
-- currently lets any member of an organization insert audit rows (with a forged actor if they want to). Locking the
-- table before that change would silently drop those rows (the writers only log insert errors).
--
-- What this does
--   * Nobody but the backend can write audit_logs; signed-in users can no longer forge or flood audit rows.
--   * Reading: a user sees the rows they caused, an admin of an organization (admin or above) sees that organization's
--     rows, a super admin sees everything including platform-level events (organization_id is NULL).
--     Before, EVERY member of an organization (students included) could read the organization's whole audit trail.

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
