-- migrate: skip
-- Read-only: reports which migrations of this repository are reflected in the database.
-- Run it in the SQL editor; it changes nothing. Plain ASCII on purpose.

select * from (values
  ('20261014_00_db_hardening',          'policy vcs_update_staff on verifiable_credentials',
     exists (select 1 from pg_policies where tablename = 'verifiable_credentials' and policyname = 'vcs_update_staff')),
  ('20261014_authz_01/04 hardening',    'is_super_admin pinned search_path, or function removed by step 08',
     coalesce((select bool_and(p.proconfig is not null) from pg_proc p where p.proname = 'is_super_admin' and p.pronamespace = 'public'::regnamespace), true)),
  ('20261014_authz_02',                 'function transfer_primary_admin',
     exists (select 1 from pg_proc where proname = 'transfer_primary_admin' and pronamespace = 'public'::regnamespace)),
  ('20261014_authz_03',                 'superseded by 20261015_02 (guard_last_org_admin)',
     exists (select 1 from pg_proc where proname = 'guard_last_org_admin' and pronamespace = 'public'::regnamespace)),
  ('20261014_authz_05a',                'function authz_actor_rank',
     exists (select 1 from pg_proc where proname = 'authz_actor_rank' and pronamespace = 'public'::regnamespace)),
  ('20261014_authz_05b',                'policy "Org admins insert their org" on user_roles',
     exists (select 1 from pg_policies where tablename = 'user_roles' and policyname = 'Org admins insert their org')),
  ('20261014_authz_05c',                'policy "role_requests: own rows"',
     exists (select 1 from pg_policies where tablename = 'role_requests' and policyname = 'role_requests: own rows')),
  ('20261014_authz_06',                 'index allowed_domains_domain_lower_uniq (or the table has a unique domain key)',
     exists (select 1 from pg_indexes where indexname in ('allowed_domains_domain_lower_uniq', 'allowed_domains_domain_key'))),
  ('20261014_core_audit_logs_normalize','audit_logs has target_type and target_id',
     (select count(*) = 2 from information_schema.columns where table_name = 'audit_logs' and column_name in ('target_type', 'target_id'))),
  ('20261014_core_vc_one_active',       'one active credential per certificate (either index name)',
     exists (select 1 from pg_indexes where indexname in ('vc_one_active_per_certificate', 'verifiable_credentials_one_active_per_certificate'))),
  ('20261014_core_vc_status_columns / vc_status_list_columns', 'status list columns on verifiable_credentials',
     (select count(*) >= 2 from information_schema.columns where table_name = 'verifiable_credentials' and column_name in ('status_list_id', 'status_list_index'))),
  ('20261014_privacy_profile_visibility', 'profiles.public_portfolio_enabled and recruiter_share_contact',
     (select count(*) = 2 from information_schema.columns where table_name = 'profiles' and column_name in ('public_portfolio_enabled', 'recruiter_share_contact'))),
  ('20261014_privacy_profiles_rls',     'policy "Users can read own profile" on profiles',
     exists (select 1 from pg_policies where tablename = 'profiles' and policyname = 'Users can read own profile')),
  ('20261014_vc_status_lists',          'table vc_status_lists (feature off in production)',
     to_regclass('public.vc_status_lists') is not null),
  ('20261014_tlog_transparency_log',    'tables tlog_entries / tlog_tree_heads (feature off in production)',
     to_regclass('public.tlog_entries') is not null and to_regclass('public.tlog_tree_heads') is not null),
  ('20261014_sd_issuances',             'table sd_issuances (feature off in production)',
     to_regclass('public.sd_issuances') is not null)
) as t(migration, marker, present)
order by 1;
