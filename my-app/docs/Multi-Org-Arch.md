# Multi-organization design

CampusSync is multi-tenant: an *organization* is an institution. This page describes how tenancy is modelled and
enforced in the code today.

```mermaid
graph TD
    SU[super_admin<br/>user_roles.organization_id = NULL] -->|can select any org| O1[(organization A)]
    SU --> O2[(organization B)]
    OA[org_admin / admin] -->|manages| O1
    F[faculty] -->|reviews certificates of| O1
    S[student] -->|owns certificates in| O1
    R[recruiter<br/>user_roles.organization_id = NULL] -->|recruiter_org_access approved| O1
    R -->|recruiter_org_access approved| O2
```

## Data model (as used by the code)

- `organizations` (`id`, `is_active`, `settings.allowed_email_domains`, primary admin, slug).
- `user_roles (user_id, role, organization_id, approval_status)`: one row per user per organization (unique on
  `(user_id, organization_id)`). `super_admin` and `recruiter` rows have `organization_id = NULL`. A user can hold
  roles in several organizations.
- `recruiter_org_access (recruiter_id, organization_id, status)`: a recruiter must request access to each
  organization (`/api/recruiter/request-access`); an org admin approves or revokes
  (`/api/admin/org/access-requests`, `/api/admin/org/revoke-access`).
- Tenant-owned data (`certificates`, `documents`, `audit_logs`, ...) carries `organization_id`.
- `organization_domains (organization_id, domain, created_by)`: the domains an organization claims, `UNIQUE(domain)`.
  `/api/admin/domains` and `/api/admin/organizations/[orgId]/domains` manage it; every write also rewrites
  `settings.allowed_email_domains` (merge) because sign-up still reads that JSON, and a database trigger keeps the
  two in sync (a domain claimed by another organization is rejected with 409). Wildcard overlaps (`*.x.edu` vs
  `a.x.edu`) are checked in the application before the insert.
- `allowed_domains`: the GLOBAL list of educational suffixes (`.edu`, `ac.in`), not organization data. Managed by
  super admins only through `/api/admin/domains?scope=global`.
- Sign-up for students/faculty requires an email domain listed in the organization's `settings.allowed_email_domains`;
  students are approved automatically, faculty become `pending` until an admin approves. Recruiters sign up with any
  email and need platform approval, then per-organization access.

## Roles (6)

`student`, `faculty`, `admin`, `recruiter`, `org_admin`, `super_admin`. A `check_primary_admin_role` rule in the
database requires an organization's primary admin to be an `org_admin`.

## How tenancy is enforced

1. **Role gate** (`withRole`): global, "holds this role in any organization".
2. **Organization gate** (`getOrganizationContext` / `getRecruiterContext`): picks the organization from the
   `X-Organization-ID` header or request body (a `user_roles` row for that organization must exist), or falls back to
   the user's earliest role row. Super admins can pick any active organization; recruiters get the list of approved
   organizations.
3. **Query filter**: routes add `organization_id = ...` / `in (...)` to queries.
4. **RLS** (user-bound client only): intended to block cross-tenant reads/writes even if a route forgets step 3.
   Policies are not in this repository; see [Security-Auth-flow.md](./Security-Auth-flow.md).

Because step 1 is global, a route that stops after `withRole` can leak across tenants. 35 route files also use the
service-role client, where steps 1 to 3 are the only protection.

## Super-admin management

`/api/v2/admin/super/**` (11 route files) creates organizations, manages admins and the primary admin
(`transfer_primary_admin`, `check_and_reserve_slug`, `generate_organization_slug` RPCs) and reports platform stats.
`/api/v2/user/organization-context` returns the caller's organizations for the client-side
`OrganizationContext`/`OrganizationSwitcher`.

## Known limitations

- Role checks are global rather than per organization.
- The "first role row" fallback for users with several organizations is order-dependent; clients should send
  `X-Organization-ID` explicitly.
- RLS policy coverage cannot be reviewed from this repository.
