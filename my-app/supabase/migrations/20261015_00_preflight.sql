-- migrate: skip
-- Schema cleanup, step 0: PRE-FLIGHT (read-only). Run this first and read every row.
-- Any row with ok = false is a blocker or a decision to make before applying 20261015_01 onwards.
-- Plain ASCII on purpose (pastes cleanly into the Supabase SQL editor).

select * from (
  select 1 as n, 'user_roles: duplicate (user_id, organization_id)' as check_name,
         not exists (select 1 from public.user_roles group by user_id, organization_id having count(*) > 1) as ok,
         null::text as detail
  union all
  select 2, 'user_roles: super_admin rows without organization are platform-level (required by 02)',
         not exists (select 1 from public.user_roles where role = 'super_admin' and organization_id is not null),
         (select string_agg(id::text, ', ') from public.user_roles where role = 'super_admin' and organization_id is not null)
  union all
  select 3, 'user_roles: primary admins are approved (required by 02)',
         not exists (select 1 from public.user_roles where is_primary_admin is true and approval_status <> 'approved'),
         null
  union all
  select 4, 'profiles: duplicate lower(email) (unique index in 01 is skipped if any)',
         not exists (select 1 from public.profiles where email is not null group by lower(email) having count(*) > 1),
         (select string_agg(distinct lower(email), ', ') from public.profiles where email is not null group by lower(email) having count(*) > 1 limit 1)
  union all
  select 5, 'certificates: rows whose legacy status disagrees with verification_status (fixed by 01, informational)',
         true,
         (select count(*)::text from public.certificates c
           where to_jsonb(c) ->> 'status' is distinct from case c.verification_status when 'verified' then 'approved' else c.verification_status end)
  union all
  select 6, 'certificates: file_url that is not a public storage url (storage_path stays null for these)',
         true,
         (select count(*)::text from public.certificates where file_url !~ '/storage/v1/object/public/certificates/.+')
  union all
  select 7, 'verifiable_credentials: more than one ACTIVE credential per certificate (blocks the unique index in 03)',
         not exists (
           select 1 from public.verifiable_credentials
           where status = 'active' and credential #>> '{credentialSubject,certificateId}' is not null
           group by credential #>> '{credentialSubject,certificateId}' having count(*) > 1),
         null
  union all
  select 8, 'verifiable_credentials: status values outside (active, revoked) (blocks the CHECK in 02)',
         not exists (select 1 from public.verifiable_credentials where status not in ('active', 'revoked')),
         (select string_agg(distinct status, ', ') from public.verifiable_credentials where status not in ('active', 'revoked'))
  union all
  select 9, 'organizations: allowed_email_domains entries that are not valid domains (skipped by the sync)',
         true,
         (select string_agg(d, ', ')
            from public.organizations o, jsonb_array_elements_text(coalesce(o.settings -> 'allowed_email_domains', '[]'::jsonb)) d
           where lower(btrim(d)) !~ '^(\*\.)?[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$')
  union all
  select 10, 'organizations: one domain claimed by two organizations (the sync would reject the second)',
         not exists (
           select 1 from (
             select lower(btrim(d)) as dom, o.id
               from public.organizations o, jsonb_array_elements_text(coalesce(o.settings -> 'allowed_email_domains', '[]'::jsonb)) d
           ) x group by dom having count(distinct id) > 1),
         null
  union all
  select 11, 'recruiter_* tables: rows with NULL organization_id (blocks NOT NULL in 02)',
         not exists (select 1 from public.recruiter_contacts where organization_id is null)
         and not exists (select 1 from public.recruiter_favorites where organization_id is null)
         and not exists (select 1 from public.recruiter_pipeline where organization_id is null),
         null
  union all
  select 12, 'audit_logs: rows (informational, all kept)', true, (select count(*)::text from public.audit_logs)
  union all
  select 13, 'auth.users triggers: run the query at the bottom and send me the result (assign_default_role)', true, null
) t
order by n;

-- Paste the result of this one back to me too: the signup trigger that pre-creates role rows.
-- It decides whether user_roles.approval_status can safely default to 'pending' (step 04b).
select t.tgname, pg_get_triggerdef(t.oid) as trigger_def, p.proname, pg_get_functiondef(p.oid) as function_def
from pg_trigger t
join pg_proc p on p.oid = t.tgfoid
where t.tgrelid = 'auth.users'::regclass and not t.tgisinternal;
