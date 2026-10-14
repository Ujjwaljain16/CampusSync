# Audit closure report

Independent audit of commit `91d0c77` (2026-10-14) and what was done about each finding on the
`audit-fixes` branch. Statuses are deliberately conservative:

- **Fixed in code** — merged, with tests that fail on the old behaviour.
- **Needs DB migration** — the code is fixed or safe, but the real protection needs a SQL change
  (drafts are in `supabase/migrations/`; nothing has been applied by this branch).
- **Needs owner action** — cannot be done from the repository.
- **Open** — known, not fixed.

"Fixed in code" does not mean "verified in production": the test suite uses in-memory fakes for the
database, no code path has been exercised against the live Supabase project, and `next build` was run
with placeholder environment variables.

## P1 findings

| ID | Finding | Status | Evidence |
|---|---|---|---|
| C-01 | Private issuer key and a Google API key in git history (`2e9bc97`), reachable from the public remote | **Needs owner action** | Keys must be rotated; history is not rewritten. CI gitleaks job will fail until then (by design). |
| C-02 | Every public credential verification failed (private JWK passed to `jwtVerify`) | **Fixed in code** | `tests/vc/vcVerify.test.ts` reproduces the old failure and checks sign → verify under EdDSA and ES256. |
| C-03 | Revocation enforced on only one verify path; `revocation_list` table does not exist; `vc.revoked` column read by nothing | **Fixed in code** | One `verifyCredential()` service used by every public endpoint; status read from `verifiable_credentials.status`; fail-closed on lookup error. |
| C-04 | `verified` is the only issuance gate and recruiters / self-review could set it; unlimited credentials per certificate | **Fixed in code** (+ DB hardening needs migration) | `certificateService` state machine, self-review refused, `bulk-verify` returns 410, issue is idempotent. `tests/certificates/*`. DB-level student UPDATE/INSERT holes: see D-02, D-03. |
| C-05 | Cross-tenant admin escalation (global role + any-row org membership) | **Fixed in code** | `authorizeOrg()`; guards that compared a value to itself replaced; `tests/api/*` run the real routes against a fake DB. |

## P2 findings

| ID | Finding | Status |
|---|---|---|
| C-06 | Wrong-org admin authority for multi-row users (earliest row used) | Fixed in code (`getOrganizationContext` ranks approved rows deterministically) |
| C-07 | Pending/denied faculty pass non-`withRole` routes, service-role verify | Fixed in code (documents API rewritten with an approved-reviewer gate in the document's org) |
| C-08 | No student consent controls; recruiters over-exposed; public portfolio exposed OCR text | Fixed in code; the two visibility columns need a migration (defaults to private if absent) |
| C-09 | Revoking recruiter access had no effect (two disjoint tables) | Fixed in code (single source of truth: `user_roles`; revoke sets `approval_status='denied'`) |
| C-10 | No last-admin / primary-admin / hierarchy guards; swallowed super-admin guard | Fixed in code (`applyRoleChange`); DB trigger is a draft (`authz_03`) |
| C-11 | Revert/reject/delete did not revoke credentials; `.single()` skipped revocation; delete returned 200 on zero rows | Fixed in code |
| C-12 | Primary-admin lookup open to any admin; domain squatting; trusted issuers writable by tenant admins | Fixed in code; unique-domain index is a draft (`authz_06`) |
| C-13 | Students could edit verified documents; `file_url` weakly bound | Fixed in code (`parseStoragePublicUrl`, owner immutability after review) |
| C-14 | Audit trail wrote three different column sets and ignored errors | Mostly fixed in code (`writeAudit` helper in the admin/recruiter/document/certificate paths). Not every legacy route was migrated. |
| C-15 | Unpaginated `listUsers()` lookups | Fixed in code (paginated, bounded helper) |
| C-16 | No CI, no schema in repo, dishonest health check, no observability | CI and honest health fixed in code; schema is **drafts only**; observability still minimal (**Open**) |
| C-17 | Placeholder tests | Fixed in code (placeholders removed; real tests added; route-inventory tripwire). Coverage of the whole app is still low. |
| C-18 | OCR cost/storage abuse | Fixed in code (student-only, daily cap, magic bytes, upload only after successful extraction); limiter is still per-instance |
| C-19 | Docs claimed httpOnly cookies, 196 routes, Ed25519, etc. | Fixed in code (docs rewritten; `TechGUIDE.md` removed) |

## Database findings

The review of the production policy set and functions produced a set of hardening changes, delivered as
idempotent draft migrations in `my-app/supabase/migrations/` (`20261014_00_db_hardening.sql` first, then the
`authz_*`, `core_*` and `privacy_*` drafts). Their specifics are intentionally not described in this public
repository. Status: **Needs DB migration** until they have been reviewed and applied; the application code no longer
depends on the affected behaviour.

Separately: the `certificates` storage bucket is public (**Open**); user-client deletes on `certificates` had no
policy and are done with a service-role client after app-level authorization (worked around in code).

## Not addressed

- Key rotation of the leaked keys (owner action, C-01).
- Making the storage bucket private (D-11).
- Per-instance in-memory rate limiting (needs a shared store).
- Metrics, tracing and alerting.
- Real end-to-end tests against a Supabase test project.
- Pending invitations: invited users get `pending` roles and nothing activates them on acceptance yet.
- Dependency clean-up (`critters`, `msw`, `happy-dom`, …) and `npm audit` (no network access during the audit).
