-- Schema cleanup, step 7 of 8: user_roles.approval_status DEFAULTS TO 'pending' (fail-safe).
-- *** APPLY ONLY AFTER you have read the auth.users trigger body (20261015_00_preflight.sql, last query) and
-- confirmed it sets approval_status EXPLICITLY. *** APPLIED to production 2026-10-15 (auth.users has no signup trigger). Idempotent. Plain ASCII on purpose.
--
-- Why: a safe default costs nothing for code that always sets the value explicitly.
--
-- Risk: if the signup trigger on auth.users inserts a role row WITHOUT approval_status and relies on the old default,
-- new students would become 'pending' and be locked out. That is why this is a separate step. If the trigger relies
-- on the default, change the trigger to insert 'approved' explicitly for students FIRST, then apply this file.

begin;

alter table public.user_roles alter column approval_status set default 'pending';

commit;

-- Verify after applying (should show 'pending'):
--   select column_default from information_schema.columns
--   where table_schema = 'public' and table_name = 'user_roles' and column_name = 'approval_status';
