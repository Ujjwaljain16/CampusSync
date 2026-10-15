-- migrate: baseline
-- Schema cleanup, step 3 of 5: INDEXES (add what the real queries need, drop the duplicates).
-- APPLIED to production 2026-10-15; apply after 20261015_02_integrity.sql. Idempotent; one transaction.
-- Plain ASCII on purpose.
--
-- Rules used: one index per access pattern; foreign keys keep a usable index (or the leading column of one);
-- low-selectivity single-column indexes (booleans, 3-value status columns) are dropped; a UNIQUE constraint already
-- provides the index for its leading columns. All tables are tiny today, so plain CREATE INDEX is fine; on a large
-- table run the CREATE INDEX statements one at a time as CREATE INDEX CONCURRENTLY outside a transaction.
--
-- Secondary indexes (primary keys and constraints not counted), before -> after:
--   certificates 20 -> 4, audit_logs 12 -> 4, user_roles 13 -> 4, organizations 9 -> 0 (its unique constraints stay),
--   role_requests 7 -> 3, recruiter_contacts 5 -> 4, recruiter_favorites 4 -> 2, recruiter_pipeline 5 -> 2,
--   allowed_domains 2 -> 0, verifiable_credentials 0 -> 5 (3 lookup + 2 partial unique).

begin;

-- ----------------------------------------------------------------------------- certificates
-- faculty queue, counts and analytics:  WHERE organization_id = ? [AND verification_status = ?] ORDER BY created_at DESC
create index if not exists certificates_org_status_created_idx
  on public.certificates (organization_id, verification_status, created_at desc);
-- "my certificates":  WHERE student_id = ? ORDER BY created_at DESC   (also serves the RLS owner check)
create index if not exists certificates_student_created_idx
  on public.certificates (student_id, created_at desc);
-- recruiter search, public portfolio, PDF export:  verified certificates of a student, newest first
create index if not exists certificates_verified_student_idx
  on public.certificates (student_id, date_issued desc) include (organization_id) where verification_status = 'verified';

drop index if exists public.certificates_status_idx;
drop index if exists public.idx_certificates_status;                       -- legacy status column, also a duplicate
drop index if exists public.certificates_student_idx;
drop index if exists public.idx_certificates_student_id;                   -- covered by certificates_student_created_idx
drop index if exists public.idx_certificates_student_status;
drop index if exists public.idx_certificates_student_verification;         -- identical to the line above
drop index if exists public.idx_certificates_student_verified;             -- replaced by certificates_verified_student_idx
drop index if exists public.idx_certificates_organization_id;              -- leading column of the new composite
drop index if exists public.idx_certificates_org_created;
drop index if exists public.idx_certificates_org_status;
drop index if exists public.idx_certificates_org_student;
drop index if exists public.idx_certificates_auto_approved;                -- boolean
drop index if exists public.idx_certificates_confidence;
drop index if exists public.idx_certificates_verification_method;
drop index if exists public.idx_certificates_verification_status;          -- 3 values
drop index if exists public.idx_certificates_institution;
drop index if exists public.idx_certificates_created_at;
drop index if exists public.idx_certificates_date_issued;
drop index if exists public.idx_certificates_title_institution_search;     -- full-text index nothing queries
-- kept: certificates_pkey and idx_certificates_faculty_id (partial, supports the faculty_id foreign key)

-- ----------------------------------------------------------------------------- audit_logs
create index if not exists audit_logs_org_created_idx
  on public.audit_logs (organization_id, created_at desc) where organization_id is not null;
create index if not exists audit_logs_actor_created_idx
  on public.audit_logs (actor_id, created_at desc) where actor_id is not null;
create index if not exists audit_logs_target_type_idx
  on public.audit_logs (target_type, target_id, created_at desc);
create index if not exists audit_logs_action_created_idx
  on public.audit_logs (action, created_at desc);

drop index if exists public.audit_logs_actor_idx;
drop index if exists public.audit_logs_target_idx;                         -- target_id only; replaced by audit_logs_target_type_idx
drop index if exists public.idx_audit_logs_action;
drop index if exists public.idx_audit_logs_actor_created;
drop index if exists public.idx_audit_logs_actor_id;
drop index if exists public.idx_audit_logs_created_at;
drop index if exists public.idx_audit_logs_org_created;
drop index if exists public.idx_audit_logs_organization_id;
drop index if exists public.idx_audit_logs_target_created;
drop index if exists public.idx_audit_logs_target_id;
drop index if exists public.idx_audit_logs_target_user_id;
drop index if exists public.idx_audit_logs_user_id;
-- target_user_id keeps its foreign key; it is dropped in step 05 together with the column

-- ----------------------------------------------------------------------------- user_roles
-- unique (user_id, organization_id) is the lookup index for "all roles of this user" (the hottest query);
-- (organization_id, role, approval_status) serves member lists, approval queues and role counts
create index if not exists user_roles_org_role_status_idx
  on public.user_roles (organization_id, role, approval_status);

drop index if exists public.idx_user_roles_user_id;                        -- leading column of the unique
drop index if exists public.idx_user_roles_user_org;                       -- identical to the unique
drop index if exists public.idx_user_roles_user_role;
drop index if exists public.user_roles_user_role_org_unique;               -- implied by unique (user_id, organization_id)
drop index if exists public.user_roles_user_role_platform_unique;          -- implied as well
drop index if exists public.idx_user_roles_organization_id;
drop index if exists public.idx_user_roles_org_role;
drop index if exists public.idx_user_roles_role;
drop index if exists public.idx_user_roles_approval;
-- kept: user_roles_pkey, user_roles_user_org_unique, unique_primary_admin_per_org, idx_user_roles_approval_pending

-- ----------------------------------------------------------------------------- organizations
-- the table is tiny and every lookup is by id/slug/email, all covered by their unique constraints
drop index if exists public.idx_organizations_slug;                        -- organizations_slug_key
drop index if exists public.idx_organizations_email;                       -- organizations_email_unique
drop index if exists public.idx_organizations_custom_domain;               -- organizations_custom_domain_key
drop index if exists public.idx_organizations_subdomain;                   -- organizations_subdomain_key
drop index if exists public.idx_organizations_active;                      -- duplicate pair
drop index if exists public.idx_organizations_is_active;
drop index if exists public.idx_organizations_type;
drop index if exists public.idx_organizations_website;
drop index if exists public.idx_organizations_created_at;

-- ----------------------------------------------------------------------------- role_requests
create index if not exists role_requests_org_status_created_idx
  on public.role_requests (organization_id, status, created_at desc);

drop index if exists public.idx_role_requests_created_at;
drop index if exists public.idx_role_requests_org_status;
drop index if exists public.idx_role_requests_organization_id;
drop index if exists public.idx_role_requests_status;
drop index if exists public.idx_role_requests_status_created;
drop index if exists public.idx_role_requests_user_id;                     -- prefix of idx_role_requests_user
-- kept: idx_role_requests_user (user_id, status), the pkey and role_requests_one_pending_idx

-- ----------------------------------------------------------------------------- recruiter_* (all keyed by recruiter_id first)
drop index if exists public.idx_recruiter_contacts_recruiter;              -- prefix of idx_recruiter_contacts_recruiter_org
drop index if exists public.idx_recruiter_contacts_date;
create index if not exists recruiter_contacts_recruiter_date_idx
  on public.recruiter_contacts (recruiter_id, contacted_at desc);
-- kept: idx_recruiter_contacts_recruiter_org, idx_recruiter_contacts_student (FK), idx_recruiter_contacts_org_id (FK)

drop index if exists public.idx_recruiter_favorites_recruiter;             -- prefix of unique_recruiter_favorite
-- kept: unique_recruiter_favorite, idx_recruiter_favorites_student (FK), idx_recruiter_favorites_org_id (FK)
drop index if exists public.idx_recruiter_favorites_recruiter_org;

drop index if exists public.idx_recruiter_pipeline_recruiter;              -- prefix of unique_recruiter_pipeline
drop index if exists public.idx_recruiter_pipeline_stage;                  -- 5 values
drop index if exists public.idx_recruiter_pipeline_recruiter_org;
-- kept: unique_recruiter_pipeline, idx_recruiter_pipeline_student (FK), idx_recruiter_pipeline_org_id (FK)

-- ----------------------------------------------------------------------------- allowed_domains
drop index if exists public.idx_allowed_domains_domain;                    -- allowed_domains_domain_key
drop index if exists public.idx_allowed_domains_active;

-- ----------------------------------------------------------------------------- verifiable_credentials
-- every public verification looks the row up by primary key (text urn:uuid:...); these serve everything else
create index if not exists verifiable_credentials_student_status_idx
  on public.verifiable_credentials (student_id, status, created_at desc);
create index if not exists verifiable_credentials_certificate_idx
  on public.verifiable_credentials (certificate_id) where certificate_id is not null;
create index if not exists verifiable_credentials_org_idx
  on public.verifiable_credentials (organization_id) where organization_id is not null;

-- at most ONE active credential per certificate (replaces the application-level "oldest wins" repair loop)
do $$
begin
  if exists (
    select 1 from public.verifiable_credentials
     where status = 'active' and certificate_id is not null
     group by certificate_id having count(*) > 1
  ) then
    raise notice 'verifiable_credentials: several ACTIVE credentials for one certificate exist; vc_one_active_per_certificate NOT created. Revoke the older ones first.';
  else
    create unique index if not exists vc_one_active_per_certificate
      on public.verifiable_credentials (certificate_id) where status = 'active' and certificate_id is not null;
  end if;
end $$;

-- status-list slots are never shared (only meaningful when VC_STATUS_LIST_ENABLED is on)
create unique index if not exists vc_status_list_slot_key
  on public.verifiable_credentials (status_list_id, status_list_index) where status_list_id is not null;

commit;
