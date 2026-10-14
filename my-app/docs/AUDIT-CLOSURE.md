# Audit closure report

Independent audit of commit `91d0c77` (2026-10-14) and what was done about each finding. Statuses are deliberately
conservative:

- **Fixed in code and deployed** — merged to `main` (everything up to and including PR #26) and deployed, with tests
  that fail on the old behaviour.
- **Needs owner action** — cannot be done from the repository.
- **Open** — known, not fixed.

"Fixed in code and deployed" does not mean "proven in production": the test suite uses in-memory fakes for the
database, and the schema-cleanup migrations are tested against a model of the production schema, not against the
production database itself. After the deployment, public credential verification, `/.well-known/did.json` and
`/.well-known/jwks.json` were checked on the live site.

## Status as of the schema cleanup

- **Code:** every code fix listed below is merged and deployed (PR #26 and earlier).
- **Database:** the schema cleanup `my-app/supabase/migrations/20261015_*` (steps 00 to 08 plus 03b) has been applied to
  production. The design and the policy model are in [DATABASE-SCHEMA.md](DATABASE-SCHEMA.md). The earlier
  `20261014_*` files are versioned patches, some applied and some optional; which is which is listed in the "Migration
  status" section of that document. The migrations are not a complete baseline dump of the original schema, which is
  still not in the repository.
- **Optional features:** the revocation status list, the transparency log and SD-JWT selective disclosure are
  implemented and unit-tested but switched off in production (their flags are off and their tables have not been
  created there).
- **Still open:** rotation of the credential-signing key (the Gemini API key was rotated on 2026-10-15), a private
  storage bucket, external monitoring and alerting, a shared (not per-instance) rate limiter, HttpOnly session
  cookies, and the Next.js major-version upgrade.

## P1 findings

| ID | Finding | Status | Evidence |
|---|---|---|---|
| C-01 | Private issuer key and a Google API key in git history (`2e9bc97`), reachable from the public remote | **Open** (owner action) | Keys must be rotated; history is not rewritten. The Gemini API key was rotated on 2026-10-15; rotation of the credential-signing key is pending (runbook in [VERIFIABLE-CREDENTIALS.md](VERIFIABLE-CREDENTIALS.md) and `SECURITY.md`). The CI gitleaks job scans the full history. |
| C-02 | Every public credential verification failed (private JWK passed to `jwtVerify`) | **Fixed in code and deployed** | `tests/vc/vcVerify.test.ts` reproduces the old failure and checks sign → verify under EdDSA and ES256. Public verification works on the live site. |
| C-03 | Revocation enforced on only one verify path; `revocation_list` table does not exist; `vc.revoked` column read by nothing | **Fixed in code and deployed** | One `verifyCredential()` service used by every public endpoint; status read from `verifiable_credentials.status`; fail-closed on lookup error. |
| C-04 | `verified` is the only issuance gate and recruiters / self-review could set it; unlimited credentials per certificate | **Fixed in code and deployed** | `certificateService` state machine, self-review refused, `bulk-verify` returns 410, issue is idempotent; the database now allows one active credential per certificate and only the backend writes credential rows. `tests/certificates/*`. Policy model: [DATABASE-SCHEMA.md](DATABASE-SCHEMA.md) section 6. |
| C-05 | Cross-tenant admin escalation (global role + any-row org membership) | **Fixed in code and deployed** | `authorizeOrg()`; guards that compared a value to itself replaced; `tests/api/*` run the real routes against a fake DB. |

## P2 findings

| ID | Finding | Status |
|---|---|---|
| C-06 | Wrong-org admin authority for multi-row users (earliest row used) | Fixed in code and deployed (`getOrganizationContext` ranks approved rows deterministically) |
| C-07 | Pending/denied faculty pass non-`withRole` routes, service-role verify | Fixed in code and deployed (the documents API that was rewritten for this has since been removed entirely) |
| C-08 | No student consent controls; recruiters over-exposed; public portfolio exposed OCR text | Fixed in code and deployed; the two visibility columns (`public_portfolio_enabled`, `recruiter_share_contact`) exist in production and default to off, and the public portfolio route serves only students who enabled it |
| C-09 | Revoking recruiter access had no effect (two disjoint tables) | Fixed in code and deployed (single source of truth: `user_roles`; revoke sets `approval_status='denied'`; `recruiter_org_access` is gone) |
| C-10 | No last-admin / primary-admin / hierarchy guards; swallowed super-admin guard | Fixed in code and deployed (`applyRoleChange`); the database guards (`guard_last_org_admin`, `protect_primary_admin`) are part of the applied schema cleanup |
| C-11 | Revert/reject/delete did not revoke credentials; `.single()` skipped revocation; delete returned 200 on zero rows | Fixed in code and deployed |
| C-12 | Primary-admin lookup open to any admin; domain squatting; trusted issuers writable by tenant admins | Fixed in code and deployed; a domain can belong to one organization only (`organization_domains`, `UNIQUE(domain)`, applied schema cleanup) |
| C-13 | Students could edit verified documents; `file_url` weakly bound | Fixed in code and deployed (certificates use `parseCertificateFileUrl`; the documents API that first used the stricter parsing has since been removed) |
| C-14 | Audit trail wrote three different column sets and ignored errors | Fixed in code and deployed: audit rows are written only by the backend (`writeAudit`, and `recordPiiRead` for recruiter reads) in one shape; the table is append-only and signed-in users cannot write it |
| C-15 | Unpaginated `listUsers()` lookups | Fixed in code and deployed (paginated, bounded helper) |
| C-16 | No CI, no schema in repo, dishonest health check, no observability | CI and honest health check fixed and deployed; the schema is versioned as patches plus a tested model (not a complete baseline dump); observability still minimal (**Open**) |
| C-17 | Placeholder tests | Fixed in code and deployed (placeholders removed; real tests added; route-inventory tripwire). Coverage of the whole app is still partial. |
| C-18 | OCR cost/storage abuse | Fixed in code and deployed (student-only, daily cap, magic bytes, upload only after successful extraction); the limiter is still per-instance (**Open**) |
| C-19 | Docs claimed httpOnly cookies, 196 routes, Ed25519, etc. | Fixed in code and deployed (docs rewritten and kept in step with the code; `TechGUIDE.md` removed) |

## Database findings

The review of the production policy set and functions produced a set of hardening changes, delivered as idempotent
migrations in `my-app/supabase/migrations/` (the `20261014_*` patches, then the `20261015_*` schema cleanup). Their
specifics are intentionally not described in this public repository. Status: the schema cleanup (`20261015_*`, steps
00 to 08) is **applied** to production and the application code no longer depends on the removed objects. For each
`20261014_*` patch see "Migration status" in [DATABASE-SCHEMA.md](DATABASE-SCHEMA.md).

Separately: the `certificates` storage bucket is public (**Open**; `certificates.storage_path` is now recorded for
every new certificate so the bucket can later be made private); user-client deletes on `certificates` have no policy
and are done with a service-role client after app-level authorization.

## Not addressed

- Key rotation of the leaked credential-signing key (owner action, C-01).
- Making the storage bucket private (D-11).
- Per-instance in-memory rate limiting (needs a shared store).
- Metrics, tracing and alerting.
- HttpOnly session cookies (a property of the Supabase browser client in use).
- Next.js major-version upgrade (the dependency-audit gate lists the accepted advisories with reasons and review dates in `my-app/audit-allowlist.json`).
- Real end-to-end tests against a Supabase test project.
- Pending invitations: invited users get `pending` roles and nothing activates them on acceptance yet.
- Dependency clean-up (`critters`, `msw`, `happy-dom`, …).
