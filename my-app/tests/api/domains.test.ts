// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any */
import { harness, req, params } from '../helpers/supabaseHarness';
import { uuid } from '../helpers/fakeSupabase';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GET, POST, DELETE } from '@/app/api/admin/domains/route';
import { GET as orgGET, PUT as orgPUT } from '@/app/api/admin/organizations/[orgId]/domains/route';
import { validateGlobalSuffix } from '@/lib/api/utils/domains';

const ORG_A = uuid(1);
const ORG_B = uuid(2);
const SUPER = uuid(12);
const ADMIN_A = uuid(10);
const ADMIN_B = uuid(13);

const json = async (res: Response) => (await res.json()) as Record<string, any>;
const orgRow = (id: string) => harness.db.rows('organizations').find((o) => o.id === id)!;
const domainsOf = (org: string) =>
  harness.db.rows('organization_domains').filter((d) => d.organization_id === org).map((d) => d.domain).sort();
const unique = { code: '23505', message: 'duplicate key value violates unique constraint "organization_domains_domain_key"' };

function seedRole(userId: string, role: string, org: string | null, n: number) {
  harness.db.seed('user_roles', [
    { id: uuid(5000 + n), user_id: userId, role, organization_id: org, approval_status: 'approved', is_primary_admin: false, created_at: '2026-02-10T00:00:00Z' },
  ]);
}

beforeEach(() => {
  harness.reset();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  harness.db.seed('organizations', [
    { id: ORG_A, name: 'A', is_active: true, created_at: '2026-01-01', settings: { timezone: 'UTC' } },
    { id: ORG_B, name: 'B', is_active: true, created_at: '2026-01-02', settings: { allowed_email_domains: ['b.edu'] } },
  ]);
  harness.db.seed('organization_domains', [{ id: uuid(900), organization_id: ORG_B, domain: 'b.edu' }]);
  harness.db.seed('allowed_domains', [{ id: uuid(901), domain: '.edu', description: 'US', is_active: true }]);
  seedRole(SUPER, 'super_admin', null, 1);
  seedRole(ADMIN_A, 'admin', ORG_A, 2);
  seedRole(ADMIN_B, 'admin', ORG_B, 3);
});

describe('org-scoped domains (organization_domains)', () => {
  it('GET lists only the caller organization; an admin cannot read or write another organization', async () => {
    harness.signIn(ADMIN_A);
    let res = await GET(req('/api/admin/domains'));
    expect(res.status).toBe(200);
    expect((await json(res)).data.domains).toEqual([]);

    harness.signIn(ADMIN_B);
    res = await GET(req('/api/admin/domains'));
    expect((await json(res)).data.domains.map((d: any) => d.domain)).toEqual(['b.edu']);

    // B's admin targeting org A
    const asA = { headers: { 'X-Organization-ID': ORG_A } };
    expect((await GET(req('/api/admin/domains', asA))).status).toBe(403);
    expect((await POST(req('/api/admin/domains', { ...asA, method: 'POST', body: { domain: 'a.edu' } }))).status).toBe(403);
    expect((await DELETE(req('/api/admin/domains?domain=b.edu', { ...asA, method: 'DELETE' }))).status).toBe(403);
    expect(domainsOf(ORG_A)).toEqual([]);
    expect(domainsOf(ORG_B)).toEqual(['b.edu']);
  });

  it('POST inserts a row and keeps the JSON setting in sync (other settings kept)', async () => {
    harness.signIn(ADMIN_A);
    let res = await POST(req('/api/admin/domains', { method: 'POST', body: { domain: 'A2.edu' } }));
    expect(res.status).toBe(201);
    res = await POST(req('/api/admin/domains', { method: 'POST', body: { domain: 'a.edu' } }));
    expect(res.status).toBe(201);

    expect(domainsOf(ORG_A)).toEqual(['a.edu', 'a2.edu']);
    expect(harness.db.rows('organization_domains').find((d) => d.domain === 'a.edu')).toMatchObject({
      organization_id: ORG_A,
      created_by: ADMIN_A,
    });
    expect(orgRow(ORG_A).settings).toEqual({ timezone: 'UTC', allowed_email_domains: ['a.edu', 'a2.edu'] });
    expect(harness.db.rows('audit_logs').map((a) => a.action)).toEqual(['domain_add', 'domain_add']);
    // the global list is untouched
    expect(harness.db.rows('allowed_domains')).toHaveLength(1);

    // adding the same domain again
    res = await POST(req('/api/admin/domains', { method: 'POST', body: { domain: 'a.edu' } }));
    expect(res.status).toBe(409);
    expect(domainsOf(ORG_A)).toEqual(['a.edu', 'a2.edu']);
  });

  it('POST rejects an overlap with another organization BEFORE touching the table', async () => {
    harness.signIn(ADMIN_A);
    // if the insert were reached it would fail with a 500, so a 409 proves the overlap check ran first
    harness.db.failures['organization_domains.insert'] = { code: 'XX000', message: 'insert must not be reached' };
    for (const domain of ['b.edu', '*.b.edu']) {
      const res = await POST(req('/api/admin/domains', { method: 'POST', body: { domain } }));
      expect(res.status, domain).toBe(409);
    }
    // a wildcard of org A overlapping an exact domain claimed by B
    harness.db.rows('organization_domains').push({ id: uuid(902), organization_id: ORG_B, domain: 'sub.c.edu' });
    const res = await POST(req('/api/admin/domains', { method: 'POST', body: { domain: '*.c.edu' } }));
    expect(res.status).toBe(409);
    expect(domainsOf(ORG_A)).toEqual([]);
  });

  it('POST maps the database unique violation to 409 without leaking the database error', async () => {
    harness.signIn(ADMIN_A);
    harness.db.failures['organization_domains.insert'] = unique;
    const res = await POST(req('/api/admin/domains', { method: 'POST', body: { domain: 'race.edu' } }));
    expect(res.status).toBe(409);
    const text = JSON.stringify(await res.json());
    expect(text).toContain('already claimed by another organization');
    expect(text).not.toContain('organization_domains_domain_key');
    expect(orgRow(ORG_A).settings).toEqual({ timezone: 'UTC' });
  });

  it('POST undoes the table insert and answers 500 when the JSON update fails', async () => {
    harness.signIn(ADMIN_A);
    harness.db.failures['organizations.update'] = { code: 'XX000', message: 'secret internal detail' };
    const res = await POST(req('/api/admin/domains', { method: 'POST', body: { domain: 'a.edu' } }));
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain('secret internal detail');
    expect(domainsOf(ORG_A)).toEqual([]);
    expect(orgRow(ORG_A).settings).toEqual({ timezone: 'UTC' });
    expect(harness.db.rows('audit_logs')).toHaveLength(0);
  });

  it('DELETE removes only the caller organization row and rewrites the JSON; unknown domain is 404', async () => {
    harness.db.seed('organization_domains', [
      { id: uuid(910), organization_id: ORG_A, domain: 'a.edu' },
      { id: uuid(911), organization_id: ORG_A, domain: 'a2.edu' },
    ]);
    harness.signIn(ADMIN_A);
    // B's domain cannot be removed through org A
    let res = await DELETE(req('/api/admin/domains?domain=b.edu', { method: 'DELETE' }));
    expect(res.status).toBe(404);
    expect(domainsOf(ORG_B)).toEqual(['b.edu']);

    res = await DELETE(req('/api/admin/domains?domain=A.edu', { method: 'DELETE' }));
    expect(res.status).toBe(200);
    expect(domainsOf(ORG_A)).toEqual(['a2.edu']);
    expect(orgRow(ORG_A).settings).toEqual({ timezone: 'UTC', allowed_email_domains: ['a2.edu'] });
    expect(harness.db.rows('audit_logs')[0]).toMatchObject({ action: 'domain_remove', organization_id: ORG_A });

    expect((await DELETE(req('/api/admin/domains', { method: 'DELETE' }))).status).toBe(400);
  });

  it('DELETE restores the row and answers 500 when the JSON update fails', async () => {
    harness.db.seed('organization_domains', [{ id: uuid(910), organization_id: ORG_A, domain: 'a.edu' }]);
    orgRow(ORG_A).settings = { timezone: 'UTC', allowed_email_domains: ['a.edu'] };
    harness.signIn(ADMIN_A);
    harness.db.failures['organizations.update'] = { code: 'XX000', message: 'boom' };
    const res = await DELETE(req('/api/admin/domains?domain=a.edu', { method: 'DELETE' }));
    expect(res.status).toBe(500);
    expect(domainsOf(ORG_A)).toEqual(['a.edu']);
    expect(orgRow(ORG_A).settings).toEqual({ timezone: 'UTC', allowed_email_domains: ['a.edu'] });
  });
});

describe('PUT/GET /api/admin/organizations/[orgId]/domains', () => {
  it('GET reads organization_domains and is limited to admins of that organization', async () => {
    harness.db.seed('organization_domains', [{ id: uuid(910), organization_id: ORG_A, domain: 'a.edu' }]);
    harness.signIn(ADMIN_A);
    let res = await orgGET(req('/x'), params({ orgId: ORG_A }));
    expect(res.status).toBe(200);
    // the table is the source, not the (empty) JSON setting
    expect((await json(res)).allowedDomains).toEqual(['a.edu']);

    harness.signIn(ADMIN_B);
    res = await orgGET(req('/x'), params({ orgId: ORG_A }));
    expect(res.status).toBe(403);
  });

  it('PUT writes the JSON setting (merge), rejects overlaps with 409 and other organizations with 403', async () => {
    harness.signIn(ADMIN_B);
    let res = await orgPUT(req('/x', { method: 'PUT', body: { domains: ['a.edu'] } }), params({ orgId: ORG_A }));
    expect(res.status).toBe(403);

    harness.signIn(ADMIN_A);
    res = await orgPUT(req('/x', { method: 'PUT', body: { domains: ['*.b.edu'] } }), params({ orgId: ORG_A }));
    expect(res.status).toBe(409);
    expect(orgRow(ORG_A).settings).toEqual({ timezone: 'UTC' });

    res = await orgPUT(req('/x', { method: 'PUT', body: { domains: ['A.edu', 'a.edu', 'a2.edu'] } }), params({ orgId: ORG_A }));
    expect(res.status).toBe(200);
    expect(orgRow(ORG_A).settings).toEqual({ timezone: 'UTC', allowed_email_domains: ['a.edu', 'a2.edu'] });
  });

  it('PUT maps the trigger unique violation to 409', async () => {
    harness.signIn(ADMIN_A);
    harness.db.failures['organizations.update'] = unique;
    const res = await orgPUT(req('/x', { method: 'PUT', body: { domains: ['a.edu'] } }), params({ orgId: ORG_A }));
    expect(res.status).toBe(409);
    expect(JSON.stringify(await res.json())).not.toContain('organization_domains_domain_key');
  });
});

describe('global suffix list (?scope=global): super admin only', () => {
  it('a tenant admin gets 403 for GET, POST and DELETE', async () => {
    harness.signIn(ADMIN_A);
    expect((await GET(req('/api/admin/domains?scope=global'))).status).toBe(403);
    expect((await POST(req('/api/admin/domains?scope=global', { method: 'POST', body: { domain: '.gov' } }))).status).toBe(403);
    expect((await DELETE(req('/api/admin/domains?scope=global&domain=.edu', { method: 'DELETE' }))).status).toBe(403);
    expect(harness.db.rows('allowed_domains').map((d) => d.domain)).toEqual(['.edu']);
  });

  it('a super admin lists, adds and removes global suffixes; organization tables are untouched', async () => {
    harness.signIn(SUPER);
    let res = await GET(req('/api/admin/domains?scope=global'));
    expect(res.status).toBe(200);
    expect((await json(res)).data.domains.map((d: any) => d.domain)).toEqual(['.edu']);

    res = await POST(req('/api/admin/domains?scope=global', { method: 'POST', body: { domain: ' AC.IN ', description: 'India' } }));
    expect(res.status).toBe(201);
    expect(harness.db.rows('allowed_domains').find((d) => d.domain === 'ac.in')).toMatchObject({
      description: 'India',
      is_active: true,
    });
    expect(harness.db.rows('allowed_domains').find((d) => d.domain === 'ac.in')).not.toHaveProperty('organization_id');

    res = await POST(req('/api/admin/domains?scope=global', { method: 'POST', body: { domain: 'ac.in' } }));
    expect(res.status).toBe(409);

    res = await POST(req('/api/admin/domains?scope=global', { method: 'POST', body: { domain: '.gov', is_active: false } }));
    expect(res.status).toBe(201);
    expect(harness.db.rows('allowed_domains').find((d) => d.domain === '.gov')?.is_active).toBe(false);

    res = await DELETE(req('/api/admin/domains?scope=global&domain=ac.in', { method: 'DELETE' }));
    expect(res.status).toBe(200);
    expect(harness.db.rows('allowed_domains').map((d) => d.domain).sort()).toEqual(['.edu', '.gov']);
    expect((await DELETE(req('/api/admin/domains?scope=global&domain=nope.in', { method: 'DELETE' }))).status).toBe(404);

    expect(harness.db.rows('audit_logs').map((a) => a.action)).toEqual([
      'global_domain_add',
      'global_domain_add',
      'global_domain_remove',
    ]);
    expect(harness.db.rows('organization_domains')).toHaveLength(1);
    expect(orgRow(ORG_A).settings).toEqual({ timezone: 'UTC' });
  });

  it('rejects malformed suffixes', async () => {
    harness.signIn(SUPER);
    for (const domain of ['', 'a'.repeat(101), 'two words', 'x@y.edu', '..edu', '*.edu', 'http://x.edu', 5]) {
      const res = await POST(req('/api/admin/domains?scope=global', { method: 'POST', body: { domain } }));
      expect(res.status, String(domain)).toBe(400);
    }
    expect(harness.db.rows('allowed_domains')).toHaveLength(1);
  });

  it('validateGlobalSuffix normalizes and enforces the format', () => {
    expect(validateGlobalSuffix('.EDU')).toMatchObject({ ok: true, domain: '.edu' });
    expect(validateGlobalSuffix('ac.in')).toMatchObject({ ok: true, domain: 'ac.in' });
    expect(validateGlobalSuffix('edu.au')).toMatchObject({ ok: true });
    for (const bad of ['', '.', '..edu', 'a b', '.edu.', '-x.edu', 'x'.repeat(101)]) {
      expect(validateGlobalSuffix(bad).ok, bad).toBe(false);
    }
  });
});
