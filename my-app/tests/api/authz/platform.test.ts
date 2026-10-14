// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any */
import { harness, req, params } from '../../helpers/supabaseHarness';
import { uuid } from '../../helpers/fakeSupabase';
import { describe, it, expect, beforeEach } from 'vitest';
import { GET as revokeGET } from '@/app/api/admin/org/access-requests/route';
import { POST as accessPOST } from '@/app/api/admin/org/access-requests/route';
import { POST as revokePOST } from '@/app/api/admin/org/revoke-access/route';
import { POST as requestAccessPOST, GET as requestAccessGET } from '@/app/api/recruiter/request-access/route';
import { POST as facultyApprovalsPOST } from '@/app/api/admin/faculty-approvals/route';
import { GET as primaryGET, POST as primaryPOST } from '@/app/api/v2/admin/super/organizations/[orgId]/primary-admin/route';
import { DELETE as removeAdminDELETE } from '@/app/api/v2/admin/super/organizations/[orgId]/admins/[adminId]/route';
import { POST as addAdminPOST } from '@/app/api/v2/admin/super/organizations/[orgId]/admins/route';
import { DELETE as orgDELETE } from '@/app/api/v2/admin/super/organizations/[orgId]/route';
import { GET as domainsGET, POST as domainsPOST } from '@/app/api/admin/domains/route';
import { PUT as orgDomainsPUT } from '@/app/api/admin/organizations/[orgId]/domains/route';
import { POST as issuersPOST, PUT as issuersPUT, DELETE as issuersDELETE, GET as issuersGET } from '@/app/api/admin/trusted-issuers/route';
import { PATCH as orgPATCH } from '@/app/api/organizations/[id]/route';
import { GET as orgsGET } from '@/app/api/organizations/route';
import { GET as analyticsGET } from '@/app/api/analytics/dashboard/route';
import { GET as adminAnalyticsGET } from '@/app/api/admin/analytics/route';
import { getOrganizationContext, isRecruiterContext } from '@/lib/api';
import { validateDomain } from '@/lib/api/utils/domains';
import { findAuthUserByEmail } from '@/lib/api/utils/authUsers';
import type { User } from '@supabase/supabase-js';

const ORG_A = uuid(1);
const ORG_B = uuid(2);
const SUPER = uuid(12);
const ADMIN_A = uuid(10);
const ADMIN_B = uuid(13);
const ORGADMIN_A = uuid(11);
const RECRUITER = uuid(70);

let seq = 0;
function seedRole(userId: string, role: string, org: string | null, extra: Record<string, unknown> = {}) {
  harness.db.seed('user_roles', [
    {
      id: uuid(5000 + ++seq),
      user_id: userId,
      role,
      organization_id: org,
      approval_status: 'approved',
      is_primary_admin: false,
      created_at: `2026-02-${String(10 + seq).padStart(2, '0')}T00:00:00Z`,
      ...extra,
    },
  ]);
}
const rowOf = (user: string, org: string | null) =>
  harness.db.rows('user_roles').find((r) => r.user_id === user && (r.organization_id ?? null) === org);
const json = async (res: Response) => (await res.json()) as Record<string, any>;

beforeEach(() => {
  harness.reset();
  seq = 0;
  harness.db.seed('organizations', [
    { id: ORG_A, name: 'A', is_active: true, created_at: '2026-01-01', settings: {}, primary_admin_id: null },
    { id: ORG_B, name: 'B', is_active: true, created_at: '2026-01-02', settings: { allowed_email_domains: ['b.edu'] } },
  ]);
  seedRole(SUPER, 'super_admin', null);
  seedRole(ADMIN_A, 'admin', ORG_A);
  seedRole(ORGADMIN_A, 'org_admin', ORG_A, { is_primary_admin: true });
  seedRole(ADMIN_B, 'admin', ORG_B);
  harness.db.seed('organization_domains', [{ id: uuid(900), domain: 'b.edu', organization_id: ORG_B }]);
});

describe('recruiter access lives in user_roles', () => {
  beforeEach(() => {
    seedRole(RECRUITER, 'recruiter', null); // platform approved
  });

  it('request-access creates a pending per-org user_roles row (no recruiter_org_access)', async () => {
    harness.signIn(RECRUITER);
    const res = await requestAccessPOST(req('/api/recruiter/request-access', { method: 'POST', body: { organization_id: ORG_A } }));
    expect(res.status).toBe(201);
    expect(rowOf(RECRUITER, ORG_A)).toMatchObject({ role: 'recruiter', approval_status: 'pending' });
    expect(harness.db.rows('recruiter_org_access')).toHaveLength(0);

    const again = await requestAccessPOST(req('/api/recruiter/request-access', { method: 'POST', body: { organization_id: ORG_A } }));
    expect(again.status).toBe(400);

    const list = await requestAccessGET(req('/api/recruiter/request-access'));
    expect((await json(list)).requests[0]).toMatchObject({ organization_id: ORG_A, status: 'pending' });
  });

  it('org admin approves, then revoke-access really removes data access', async () => {
    harness.signIn(RECRUITER);
    await requestAccessPOST(req('/api/recruiter/request-access', { method: 'POST', body: { organization_id: ORG_A } }));
    const requestId = rowOf(RECRUITER, ORG_A)!.id;

    // an admin of ANOTHER org cannot see/approve it
    harness.signIn(ADMIN_B);
    let res = await accessPOST(req('/api/admin/org/access-requests', { method: 'POST', body: { requestId, action: 'approve' } }));
    expect(res.status).toBe(404);

    harness.signIn(ADMIN_A);
    const list = await revokeGET(req('/api/admin/org/access-requests'));
    expect((await json(list)).count).toBe(1);
    res = await accessPOST(req('/api/admin/org/access-requests', { method: 'POST', body: { requestId, action: 'approve' } }));
    expect(res.status).toBe(200);
    expect(rowOf(RECRUITER, ORG_A)?.approval_status).toBe('approved');

    // data access (what every recruiter route consults) now includes org A
    harness.signIn(RECRUITER);
    let ctx = await getOrganizationContext({ id: RECRUITER } as User);
    expect(isRecruiterContext(ctx) && ctx.accessibleOrganizations).toEqual([ORG_A]);

    // revoke
    harness.signIn(ADMIN_A);
    res = await revokePOST(req('/api/admin/org/revoke-access', { method: 'POST', body: { recruiterId: RECRUITER, reason: 'contract ended' } }));
    expect(res.status).toBe(200);
    expect(rowOf(RECRUITER, ORG_A)?.approval_status).toBe('denied');

    harness.signIn(RECRUITER);
    ctx = await getOrganizationContext({ id: RECRUITER } as User);
    expect(isRecruiterContext(ctx) && ctx.accessibleOrganizations).toEqual([]);

    // a second revoke has nothing to revoke
    harness.signIn(ADMIN_A);
    res = await revokePOST(req('/api/admin/org/revoke-access', { method: 'POST', body: { recruiterId: RECRUITER } }));
    expect(res.status).toBe(404);
  });

  it('an admin of another org cannot revoke', async () => {
    seedRole(RECRUITER, 'recruiter', ORG_A);
    harness.signIn(ADMIN_B);
    const res = await revokePOST(req('/api/admin/org/revoke-access', { method: 'POST', body: { recruiterId: RECRUITER } }));
    expect(res.status).toBe(404);
    expect(rowOf(RECRUITER, ORG_A)?.approval_status).toBe('approved');
  });

  it('faculty-approvals POST targets the exact pending (user, org) row of a multi-pending recruiter', async () => {
    seedRole(RECRUITER, 'recruiter', ORG_A, { approval_status: 'pending' });
    seedRole(RECRUITER, 'recruiter', ORG_B, { approval_status: 'pending' });
    harness.signIn(ADMIN_A);
    const res = await facultyApprovalsPOST(req('/api/admin/faculty-approvals', {
      method: 'POST',
      body: { user_id: RECRUITER, organization_id: ORG_A, approval_status: 'approved' },
    }));
    expect(res.status).toBe(200);
    expect(rowOf(RECRUITER, ORG_A)?.approval_status).toBe('approved');
    expect(rowOf(RECRUITER, ORG_B)?.approval_status).toBe('pending');

    // ADMIN_A cannot approve the org B row, and platform rows are super-only
    const foreign = await facultyApprovalsPOST(req('/api/admin/faculty-approvals', {
      method: 'POST',
      body: { user_id: RECRUITER, organization_id: ORG_B, approval_status: 'approved' },
    }));
    expect(foreign.status).toBe(403);
    const platform = await facultyApprovalsPOST(req('/api/admin/faculty-approvals', {
      method: 'POST',
      body: { user_id: RECRUITER, organization_id: null, approval_status: 'denied' },
    }));
    expect(platform.status).toBe(403);
  });
});

describe('v2 primary admin', () => {
  it('GET denies an admin of a foreign organization; allows own org admin and super_admin', async () => {
    harness.signIn(ADMIN_B);
    let res = await primaryGET(req(`/api/v2/admin/super/organizations/${ORG_A}/primary-admin`), params({ orgId: ORG_A }));
    expect(res.status).toBe(403);

    harness.signIn(ADMIN_A);
    res = await primaryGET(req(`/api/v2/admin/super/organizations/${ORG_A}/primary-admin`), params({ orgId: ORG_A }));
    expect(res.status).toBe(200);
    expect((await json(res)).data.user_id).toBe(ORGADMIN_A);

    harness.signIn(SUPER);
    res = await primaryGET(req(`/api/v2/admin/super/organizations/${ORG_A}/primary-admin`), params({ orgId: ORG_A }));
    expect(res.status).toBe(200);
  });

  it('POST accepts {new_primary_admin_id} (what the UI sends) and looks up the current primary', async () => {
    const NEW = uuid(80);
    seedRole(NEW, 'org_admin', ORG_A);
    harness.signIn(SUPER);
    const res = await primaryPOST(
      req(`/api/v2/admin/super/organizations/${ORG_A}/primary-admin`, { method: 'POST', body: { new_primary_admin_id: NEW } }),
      params({ orgId: ORG_A })
    );
    expect(res.status).toBe(200);
    expect(rowOf(NEW, ORG_A)?.is_primary_admin).toBe(true);
    expect(rowOf(ORGADMIN_A, ORG_A)?.is_primary_admin).toBe(false);
    expect(harness.db.rows('organizations').find((o) => o.id === ORG_A)?.primary_admin_id).toBe(NEW);
    expect(harness.db.rows('audit_logs').some((a) => a.action === 'transfer_primary_admin')).toBe(true);
  });

  it('POST still accepts the legacy {from_user_id,to_user_id} and rejects a wrong source', async () => {
    const NEW = uuid(80);
    seedRole(NEW, 'org_admin', ORG_A);
    harness.signIn(SUPER);
    let res = await primaryPOST(
      req(`/api/v2/admin/super/organizations/${ORG_A}/primary-admin`, { method: 'POST', body: { from_user_id: ADMIN_A, to_user_id: NEW } }),
      params({ orgId: ORG_A })
    );
    expect(res.status).toBe(422);
    res = await primaryPOST(
      req(`/api/v2/admin/super/organizations/${ORG_A}/primary-admin`, { method: 'POST', body: { from_user_id: ORGADMIN_A, to_user_id: NEW } }),
      params({ orgId: ORG_A })
    );
    expect(res.status).toBe(200);
  });

  it('POST rejects a target from another org and non-super callers', async () => {
    harness.signIn(SUPER);
    let res = await primaryPOST(
      req(`/api/v2/admin/super/organizations/${ORG_A}/primary-admin`, { method: 'POST', body: { new_primary_admin_id: ADMIN_B } }),
      params({ orgId: ORG_A })
    );
    expect(res.status).toBe(422);
    harness.signIn(ORGADMIN_A);
    res = await primaryPOST(
      req(`/api/v2/admin/super/organizations/${ORG_A}/primary-admin`, { method: 'POST', body: { new_primary_admin_id: ADMIN_A } }),
      params({ orgId: ORG_A })
    );
    expect(res.status).toBe(403);
  });

  it('adding a new primary admin keeps exactly one primary and never leaves the org without one on failure', async () => {
    harness.signIn(SUPER);
    harness.db.authUsers.push({ id: uuid(81), email: 'new@a.edu' });
    const res = await addAdminPOST(
      req(`/api/v2/admin/super/organizations/${ORG_A}/admins`, {
        method: 'POST',
        body: { email: 'NEW@a.edu', full_name: 'New Admin', role: 'org_admin', is_primary_admin: true },
      }),
      params({ orgId: ORG_A })
    );
    expect(res.status).toBe(201);
    const primaries = harness.db.rows('user_roles').filter((r) => r.organization_id === ORG_A && r.is_primary_admin);
    expect(primaries.map((p) => p.user_id)).toEqual([uuid(81)]);
    expect(harness.db.rows('audit_logs').some((a) => a.action === 'org_admin_add')).toBe(true);
  });

  it('removing the primary admin or the last admin is refused; removing a spare admin works', async () => {
    harness.signIn(SUPER);
    let res = await removeAdminDELETE(req('/x', { method: 'DELETE' }), params({ orgId: ORG_A, adminId: ORGADMIN_A }));
    expect(res.status).toBe(403);
    res = await removeAdminDELETE(req('/x', { method: 'DELETE' }), params({ orgId: ORG_A, adminId: ADMIN_A }));
    expect(res.status).toBe(200);
    expect(rowOf(ADMIN_A, ORG_A)).toBeUndefined();
  });

  it('hard delete of an organization audits first and needs super_admin', async () => {
    harness.signIn(ADMIN_A);
    let res = await orgDELETE(req('/x', { method: 'DELETE' }), params({ orgId: ORG_B }));
    expect(res.status).toBe(403);
    harness.signIn(SUPER);
    res = await orgDELETE(req('/x', { method: 'DELETE' }), params({ orgId: ORG_B }));
    expect(res.status).toBe(200);
    const audit = harness.db.rows('audit_logs').find((a) => a.action === 'organization_hard_delete');
    expect(audit).toMatchObject({ actor_id: SUPER, target_id: ORG_B, organization_id: null });
    expect(harness.db.rows('organizations').some((o) => o.id === ORG_B)).toBe(false);
  });
});

describe('allowed domains', () => {
  it('validateDomain rules', () => {
    expect(validateDomain('University.EDU')).toMatchObject({ ok: true, domain: 'university.edu' });
    expect(validateDomain('*.university.edu')).toMatchObject({ ok: true, wildcard: true });
    for (const bad of ['gmail.com', 'user@x.edu', '*.edu', 'edu', '*gmail.com', 'a*.b.edu', 'x..edu', 'co.uk', '*.gmail.com', 'mail.gmail.com', '', 42, 'http://x.edu']) {
      expect(validateDomain(bad).ok, String(bad)).toBe(false);
    }
  });

  it('POST rejects public mail providers and malformed domains', async () => {
    harness.signIn(ADMIN_A);
    for (const domain of ['gmail.com', '*.edu', 'not a domain']) {
      const res = await domainsPOST(req('/api/admin/domains', { method: 'POST', body: { domain } }));
      expect(res.status, domain).toBe(400);
    }
  });

  it('POST rejects a domain already claimed by another org (squatting), in both stores', async () => {
    harness.signIn(ADMIN_A);
    let res = await domainsPOST(req('/api/admin/domains', { method: 'POST', body: { domain: 'B.edu' } }));
    expect(res.status).toBe(409);
    res = await domainsPOST(req('/api/admin/domains', { method: 'POST', body: { domain: '*.b.edu' } }));
    expect(res.status).toBe(409);
    harness.db.seed('organizations', [{ id: uuid(3), name: 'C', settings: { allowed_email_domains: ['c.edu'] } }]);
    res = await domainsPOST(req('/api/admin/domains', { method: 'POST', body: { domain: 'c.edu' } }));
    expect(res.status).toBe(409);
    expect(harness.db.rows('organization_domains').filter((d) => d.organization_id === ORG_A)).toHaveLength(0);
  });

  it('POST adds an org-scoped domain; GET only lists the caller\'s org', async () => {
    harness.signIn(ADMIN_A);
    let res = await domainsPOST(req('/api/admin/domains', { method: 'POST', body: { domain: 'A.edu', description: 'main' } }));
    expect(res.status).toBe(201);
    expect(harness.db.rows('organization_domains').find((d) => d.domain === 'a.edu')).toMatchObject({ organization_id: ORG_A });
    res = await domainsGET(req('/api/admin/domains'));
    const list = (await json(res)).data.domains;
    expect(list.map((d: any) => d.domain)).toEqual(['a.edu']);
  });

  it('PUT org domains: foreign admin 403, squatting 409, merge keeps other settings', async () => {
    harness.db.rows('organizations').find((o) => o.id === ORG_A)!.settings = { timezone: 'UTC' };
    harness.signIn(ADMIN_B);
    let res = await orgDomainsPUT(req('/x', { method: 'PUT', body: { domains: ['a.edu'] } }), params({ orgId: ORG_A }));
    expect(res.status).toBe(403);

    harness.signIn(ADMIN_A);
    res = await orgDomainsPUT(req('/x', { method: 'PUT', body: { domains: ['b.edu'] } }), params({ orgId: ORG_A }));
    expect(res.status).toBe(409);
    res = await orgDomainsPUT(req('/x', { method: 'PUT', body: { domains: ['gmail.com'] } }), params({ orgId: ORG_A }));
    expect(res.status).toBe(400);

    res = await orgDomainsPUT(req('/x', { method: 'PUT', body: { domains: ['A.edu', 'a.edu'] } }), params({ orgId: ORG_A }));
    expect(res.status).toBe(200);
    expect(harness.db.rows('organizations').find((o) => o.id === ORG_A)?.settings).toEqual({
      timezone: 'UTC',
      allowed_email_domains: ['a.edu'],
    });
  });
});

describe('trusted issuers are global: super_admin only for writes', () => {
  const issuer = { name: 'NPTEL', domain: 'nptel.ac.in', confidence_threshold: 0.8, qr_verification_url: 'https://nptel.ac.in/verify' };

  it('admins and org_admins get 403 on POST/PUT/DELETE but can GET', async () => {
    harness.db.seed('trusted_issuers', [{ id: uuid(700), name: 'X', organization_id: null }]);
    for (const who of [ADMIN_A, ORGADMIN_A]) {
      harness.signIn(who);
      expect((await issuersPOST(req('/x', { method: 'POST', body: issuer }))).status).toBe(403);
      expect((await issuersPUT(req('/x', { method: 'PUT', body: { id: uuid(700), name: 'Y' } }))).status).toBe(403);
      expect((await issuersDELETE(req(`/x?id=${uuid(700)}`, { method: 'DELETE' }))).status).toBe(403);
      expect((await issuersGET(req('/x'))).status).toBe(200);
    }
    expect(harness.db.rows('trusted_issuers')[0].name).toBe('X');
  });

  it('super_admin can create; validates threshold and https URL; 404 on unknown id', async () => {
    harness.signIn(SUPER);
    expect((await issuersPOST(req('/x', { method: 'POST', body: issuer }))).status).toBe(201);
    expect(harness.db.rows('trusted_issuers')[0]).toMatchObject({ name: 'NPTEL', organization_id: null });

    expect((await issuersPOST(req('/x', { method: 'POST', body: { ...issuer, confidence_threshold: 1.5 } }))).status).toBe(422);
    expect((await issuersPOST(req('/x', { method: 'POST', body: { ...issuer, confidence_threshold: -0.1 } }))).status).toBe(422);
    expect((await issuersPOST(req('/x', { method: 'POST', body: { ...issuer, qr_verification_url: 'http://insecure.test' } }))).status).toBe(422);
    expect((await issuersPOST(req('/x', { method: 'POST', body: { ...issuer, qr_verification_url: 'javascript:alert(1)' } }))).status).toBe(422);
    // threshold 0 is a legal value (the old `|| 0.9` turned it into 0.9)
    expect((await issuersPOST(req('/x', { method: 'POST', body: { name: 'Zero', confidence_threshold: 0 } }))).status).toBe(201);
    expect(harness.db.rows('trusted_issuers').find((r) => r.name === 'Zero')?.confidence_threshold).toBe(0);

    expect((await issuersPUT(req('/x', { method: 'PUT', body: { id: uuid(799), name: 'Nope' } }))).status).toBe(404);
    expect((await issuersDELETE(req(`/x?id=${uuid(799)}`, { method: 'DELETE' }))).status).toBe(404);
  });
});

describe('organizations: settings allowlist + merge, explicit columns', () => {
  it('PATCH merges allow-listed settings and refuses unknown / privileged keys for org admins', async () => {
    harness.db.rows('organizations').find((o) => o.id === ORG_A)!.settings = {
      timezone: 'UTC',
      allowed_email_domains: ['a.edu'],
      features: { analytics: true, recruiter_access: true },
    };
    harness.signIn(ORGADMIN_A);

    let res = await orgPATCH(req('/x', { method: 'PATCH', body: { settings: { language: 'hi', features: { analytics: false } } } }), params({ id: ORG_A }));
    expect(res.status).toBe(200);
    expect(harness.db.rows('organizations').find((o) => o.id === ORG_A)?.settings).toEqual({
      timezone: 'UTC',
      allowed_email_domains: ['a.edu'],
      language: 'hi',
      features: { analytics: false, recruiter_access: true },
    });

    res = await orgPATCH(req('/x', { method: 'PATCH', body: { settings: { allowed_email_domains: ['evil.com'] } } }), params({ id: ORG_A }));
    expect(res.status).toBe(403);
    res = await orgPATCH(req('/x', { method: 'PATCH', body: { settings: { enable_sso: true } } }), params({ id: ORG_A }));
    expect(res.status).toBe(403);
    res = await orgPATCH(req('/x', { method: 'PATCH', body: { settings: { __proto__x: 1, anything: 'goes' } } }), params({ id: ORG_A }));
    expect(res.status).toBe(422);
    res = await orgPATCH(req('/x', { method: 'PATCH', body: { branding: { logo_url: 'javascript:alert(1)' } } }), params({ id: ORG_A }));
    expect(res.status).toBe(422);
    res = await orgPATCH(req('/x', { method: 'PATCH', body: { subdomain: 'x' } }), params({ id: ORG_A }));
    expect(res.status).toBe(403);
  });

  it('PATCH from an admin of another org is 403', async () => {
    harness.signIn(ADMIN_B);
    const res = await orgPATCH(req('/x', { method: 'PATCH', body: { name: 'Hacked' } }), params({ id: ORG_A }));
    expect(res.status).toBe(403);
    expect(harness.db.rows('organizations').find((o) => o.id === ORG_A)?.name).toBe('A');
  });

  it('GET /api/organizations lists only the caller\'s approved organizations with their role', async () => {
    seedRole(uuid(90), 'student', ORG_A);
    seedRole(uuid(90), 'faculty', ORG_B, { approval_status: 'pending' });
    harness.signIn(uuid(90));
    const res = await orgsGET(req('/api/organizations'));
    expect(res.status).toBe(200);
    const orgs = (await json(res)).data.organizations;
    expect(orgs.map((o: any) => o.id)).toEqual([ORG_A]);
    expect(orgs[0].user_role).toBe('student');
  });
});

describe('analytics returns no fabricated metrics', () => {
  it('analytics/dashboard systemPerformance is explicitly unavailable', async () => {
    harness.signIn(ADMIN_A);
    const res = await analyticsGET(req('/api/analytics/dashboard'));
    expect(res.status).toBe(200);
    const perf = (await json(res)).data.systemPerformance;
    expect(perf).toEqual({ available: false, averageProcessingTime: null, successRate: null, errorRate: null });
  });

  it('admin/analytics has no process.uptime', async () => {
    harness.signIn(ADMIN_A);
    const res = await adminAnalyticsGET(req('/api/admin/analytics'));
    expect(res.status).toBe(200);
    expect((await json(res)).data.system).toMatchObject({ available: false, uptime: null });
  });

  it('analytics deny an admin of a foreign organization', async () => {
    harness.signIn(ADMIN_A);
    const res = await analyticsGET(req('/api/analytics/dashboard', { headers: { 'X-Organization-ID': ORG_B } }));
    expect(res.status).toBe(403);
  });
});

describe('findAuthUserByEmail', () => {
  it('walks pages until found, case-insensitively, and returns null when absent', async () => {
    for (let i = 0; i < 2500; i++) harness.db.authUsers.push({ id: uuid(200000 + i), email: `u${i}@x.edu` });
    const client = harness.db.client('service-role');
    expect((await findAuthUserByEmail(client, 'U2400@X.EDU'))?.id).toBe(uuid(200000 + 2400));
    expect(await findAuthUserByEmail(client, 'nobody@x.edu')).toBeNull();
  });
});
