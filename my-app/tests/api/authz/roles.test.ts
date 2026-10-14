// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any */
import { harness, req, params } from '../../helpers/supabaseHarness';
import { uuid } from '../../helpers/fakeSupabase';
import { describe, it, expect, beforeEach } from 'vitest';
import { GET as rolesGET, POST as rolesPOST, DELETE as rolesDELETE } from '@/app/api/admin/roles/route';
import { POST as changePOST } from '@/app/api/admin/roles/change/route';
import { POST as inviteePOST } from '@/app/api/admin/invite/route';
import { POST as notifPOST } from '@/app/api/notifications/role-approval/route';
import { POST as approvePOST } from '@/app/api/admin/role-requests/[id]/approve/route';
import { POST as denyPOST } from '@/app/api/admin/role-requests/[id]/deny/route';

const ORG_A = uuid(1);
const ORG_B = uuid(2);
const ADMIN_A = uuid(10); // admin in A, student in B (confused-deputy candidate)
const ORG_ADMIN_A = uuid(11);
const SUPER = uuid(12);
const TARGET = uuid(20);
const OTHER = uuid(21);

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
      created_at: `2026-01-${String(10 + seq).padStart(2, '0')}T00:00:00Z`,
      ...extra,
    },
  ]);
}
const rowOf = (user: string, org: string | null) =>
  harness.db.rows('user_roles').find((r) => r.user_id === user && (r.organization_id ?? null) === org);
const body = async (res: Response) => (await res.json()) as Record<string, any>;

beforeEach(() => {
  harness.reset();
  seq = 0;
  harness.db.seed('organizations', [
    { id: ORG_A, name: 'A', is_active: true, created_at: '2026-01-01' },
    { id: ORG_B, name: 'B', is_active: true, created_at: '2026-01-02' },
  ]);
  seedRole(ADMIN_A, 'admin', ORG_A);
  seedRole(ADMIN_A, 'student', ORG_B);
  seedRole(ORG_ADMIN_A, 'org_admin', ORG_A);
  seedRole(SUPER, 'super_admin', null);
  seedRole(TARGET, 'student', ORG_A);
  seedRole(OTHER, 'student', ORG_B);
  harness.db.authUsers.push({ id: TARGET, email: 'target@a.edu' }, { id: OTHER, email: 'other@b.edu' });
});

describe('confused deputy (admin of A, student in B)', () => {
  it('cannot list roles of org B via X-Organization-ID', async () => {
    harness.signIn(ADMIN_A);
    const res = await rolesGET(req('/api/admin/roles', { headers: { 'X-Organization-ID': ORG_B } }));
    expect(res.status).toBe(403);
  });

  it('cannot assign a role in org B (body organization_id)', async () => {
    harness.signIn(ADMIN_A);
    const res = await rolesPOST(req('/api/admin/roles', { method: 'POST', body: { user_id: OTHER, role: 'faculty', organization_id: ORG_B } }));
    expect(res.status).toBe(403);
    expect(rowOf(OTHER, ORG_B)?.role).toBe('student');
  });

  it('cannot delete a role in org B', async () => {
    harness.signIn(ADMIN_A);
    const res = await rolesDELETE(req(`/api/admin/roles?user_id=${OTHER}&organization_id=${ORG_B}`, { method: 'DELETE' }));
    expect(res.status).toBe(403);
    expect(rowOf(OTHER, ORG_B)).toBeDefined();
  });

  it('cannot invite into org B', async () => {
    harness.signIn(ADMIN_A);
    const res = await inviteePOST(req('/api/admin/invite', { method: 'POST', body: { email: 'new@b.edu', role: 'student', organizationId: ORG_B } }));
    expect(res.status).toBe(403);
    expect(harness.db.invited).toHaveLength(0);
  });

  it('can still administer org A and the list is scoped to A', async () => {
    harness.signIn(ADMIN_A);
    const res = await rolesGET(req('/api/admin/roles', { headers: { 'X-Organization-ID': ORG_A } }));
    expect(res.status).toBe(200);
    const json = await body(res);
    expect(json.data.every((r: any) => r.organization_id === ORG_A)).toBe(true);
    expect(json.data.length).toBeGreaterThan(0);
  });

  it('default org is the highest approved role (A), even though the student row in B was created later', async () => {
    harness.signIn(ADMIN_A);
    const res = await rolesGET(req('/api/admin/roles'));
    expect(res.status).toBe(200);
    expect((await body(res)).data.every((r: any) => r.organization_id === ORG_A)).toBe(true);
  });
});

describe('role hierarchy on /api/admin/roles', () => {
  it('admin cannot grant org_admin or admin', async () => {
    harness.signIn(ADMIN_A);
    for (const role of ['org_admin', 'admin', 'super_admin']) {
      // super_admin is platform-level: no organization_id
      const payload = role === 'super_admin' ? { user_id: TARGET, role } : { user_id: TARGET, role, organization_id: ORG_A };
      const res = await rolesPOST(req('/api/admin/roles', { method: 'POST', body: payload }));
      expect(res.status).toBe(403);
    }
    expect(rowOf(TARGET, ORG_A)?.role).toBe('student');
  });

  it('admin can grant faculty; row is approved and org-scoped', async () => {
    harness.signIn(ADMIN_A);
    const res = await rolesPOST(req('/api/admin/roles', { method: 'POST', body: { user_id: TARGET, role: 'faculty', organization_id: ORG_A } }));
    expect(res.status).toBe(200);
    const row = rowOf(TARGET, ORG_A)!;
    expect(row.role).toBe('faculty');
    expect(row.approval_status).toBe('approved');
    expect(harness.db.rows('user_roles').filter((r) => r.user_id === TARGET)).toHaveLength(1);
  });

  it('org_admin can grant admin but not org_admin; super_admin can grant org_admin', async () => {
    harness.signIn(ORG_ADMIN_A);
    let res = await rolesPOST(req('/api/admin/roles', { method: 'POST', body: { user_id: TARGET, role: 'org_admin', organization_id: ORG_A } }));
    expect(res.status).toBe(403);
    res = await rolesPOST(req('/api/admin/roles', { method: 'POST', body: { user_id: TARGET, role: 'admin', organization_id: ORG_A } }));
    expect(res.status).toBe(200);
    harness.signIn(SUPER);
    res = await rolesPOST(req('/api/admin/roles', { method: 'POST', body: { user_id: TARGET, role: 'org_admin', organization_id: ORG_A } }));
    expect(res.status).toBe(200);
    expect(rowOf(TARGET, ORG_A)?.role).toBe('org_admin');
  });

  it('rejects unknown roles and malformed ids', async () => {
    harness.signIn(ORG_ADMIN_A);
    let res = await rolesPOST(req('/api/admin/roles', { method: 'POST', body: { user_id: TARGET, role: 'root', organization_id: ORG_A } }));
    expect(res.status).toBe(422);
    res = await rolesPOST(req('/api/admin/roles', { method: 'POST', body: { user_id: 'nope', role: 'faculty', organization_id: ORG_A } }));
    expect(res.status).toBe(422);
  });

  it('nobody can change or remove their own role', async () => {
    harness.signIn(ORG_ADMIN_A);
    let res = await rolesPOST(req('/api/admin/roles', { method: 'POST', body: { user_id: ORG_ADMIN_A, role: 'student', organization_id: ORG_A } }));
    expect(res.status).toBe(403);
    res = await rolesDELETE(req(`/api/admin/roles?user_id=${ORG_ADMIN_A}&organization_id=${ORG_A}`, { method: 'DELETE' }));
    expect(res.status).toBe(403);
    expect(rowOf(ORG_ADMIN_A, ORG_A)?.role).toBe('org_admin');
  });

  it('admin cannot remove another admin; org_admin can remove a student', async () => {
    seedRole(OTHER, 'admin', ORG_A);
    harness.signIn(ADMIN_A);
    let res = await rolesDELETE(req(`/api/admin/roles?user_id=${OTHER}&organization_id=${ORG_A}`, { method: 'DELETE' }));
    expect(res.status).toBe(403);
    harness.signIn(ORG_ADMIN_A);
    res = await rolesDELETE(req(`/api/admin/roles?user_id=${TARGET}&organization_id=${ORG_A}`, { method: 'DELETE' }));
    expect(res.status).toBe(200);
    expect(rowOf(TARGET, ORG_A)).toBeUndefined();
  });
});

describe('last admin / primary admin guards', () => {
  it('super_admin cannot demote the last admin of an organization', async () => {
    // org B has no admin besides the one we create here
    seedRole(uuid(30), 'org_admin', ORG_B);
    harness.signIn(SUPER);
    const res = await changePOST(req('/api/admin/roles/change', {
      method: 'POST',
      body: { user_id: uuid(30), new_role: 'student', organization_id: ORG_B, reason: 'stepping down for testing' },
    }));
    expect(res.status).toBe(409);
    expect(rowOf(uuid(30), ORG_B)?.role).toBe('org_admin');
  });

  it('can demote an admin when another admin remains', async () => {
    seedRole(uuid(30), 'org_admin', ORG_B);
    seedRole(uuid(31), 'admin', ORG_B);
    harness.signIn(SUPER);
    const res = await changePOST(req('/api/admin/roles/change', {
      method: 'POST',
      body: { user_id: uuid(31), new_role: 'student', organization_id: ORG_B, reason: 'no longer needed here' },
    }));
    expect(res.status).toBe(200);
    expect(rowOf(uuid(31), ORG_B)?.role).toBe('student');
  });

  it('the primary admin cannot be demoted or removed outside the transfer flow', async () => {
    seedRole(uuid(30), 'org_admin', ORG_B, { is_primary_admin: true });
    seedRole(uuid(31), 'org_admin', ORG_B);
    harness.signIn(SUPER);
    let res = await changePOST(req('/api/admin/roles/change', {
      method: 'POST',
      body: { user_id: uuid(30), new_role: 'admin', organization_id: ORG_B, reason: 'testing primary guard here' },
    }));
    expect(res.status).toBe(403);
    res = await rolesDELETE(req(`/api/admin/roles?user_id=${uuid(30)}&organization_id=${ORG_B}`, { method: 'DELETE' }));
    expect(res.status).toBe(403);
    expect(rowOf(uuid(30), ORG_B)?.is_primary_admin).toBe(true);
  });

  it('a super_admin row can never be demoted through the API (even by a super_admin)', async () => {
    seedRole(uuid(40), 'super_admin', ORG_A); // super_admin row that happens to carry an org
    harness.signIn(SUPER);
    const res = await changePOST(req('/api/admin/roles/change', {
      method: 'POST',
      body: { user_id: uuid(40), new_role: 'student', organization_id: ORG_A, reason: 'attempted founder demotion' },
    }));
    expect(res.status).toBe(403);
    expect(rowOf(uuid(40), ORG_A)?.role).toBe('super_admin');
  });
});

describe('/api/admin/roles/change targets the exact (user, org) row', () => {
  it('only changes the row of the requested org for a multi-org user', async () => {
    seedRole(uuid(50), 'student', ORG_A);
    seedRole(uuid(50), 'faculty', ORG_B);
    harness.signIn(ORG_ADMIN_A);
    const res = await changePOST(req('/api/admin/roles/change', {
      method: 'POST',
      body: { user_id: uuid(50), new_role: 'faculty', organization_id: ORG_A },
    }));
    expect(res.status).toBe(200);
    expect(rowOf(uuid(50), ORG_A)?.role).toBe('faculty');
    expect(rowOf(uuid(50), ORG_B)?.role).toBe('faculty'); // untouched
    expect((await body(res)).data.old_role).toBe('student');
  });

  it('writes an audit row with the shared column set', async () => {
    harness.signIn(ORG_ADMIN_A);
    await changePOST(req('/api/admin/roles/change', { method: 'POST', body: { user_id: TARGET, new_role: 'faculty', organization_id: ORG_A } }));
    const audit = harness.db.rows('audit_logs')[0];
    expect(audit).toMatchObject({ actor_id: ORG_ADMIN_A, action: 'role_change', target_id: TARGET, organization_id: ORG_A });
  });
});

describe('invite never overwrites a role in another org', () => {
  it('existing user with a row in B gets a NEW pending row in A; B row untouched', async () => {
    harness.signIn(ORG_ADMIN_A);
    const res = await inviteePOST(req('/api/admin/invite', {
      method: 'POST',
      body: { email: 'OTHER@b.edu', role: 'faculty', organizationId: ORG_A },
    }));
    expect(res.status).toBe(200);
    expect(rowOf(OTHER, ORG_B)).toMatchObject({ role: 'student', approval_status: 'approved' });
    expect(rowOf(OTHER, ORG_A)).toMatchObject({ role: 'faculty', approval_status: 'pending' });
  });

  it('new invitee gets a pending (not approved) row and admin may not invite an admin', async () => {
    harness.signIn(ADMIN_A);
    let res = await inviteePOST(req('/api/admin/invite', { method: 'POST', body: { email: 'x@a.edu', role: 'admin', organizationId: ORG_A } }));
    expect(res.status).toBe(403);
    res = await inviteePOST(req('/api/admin/invite', { method: 'POST', body: { email: 'x@a.edu', role: 'faculty', organizationId: ORG_A } }));
    expect(res.status).toBe(200);
    const created = harness.db.authUsers.find((u) => u.email === 'x@a.edu')!;
    expect(rowOf(created.id, ORG_A)).toMatchObject({ role: 'faculty', approval_status: 'pending' });
  });

  it('finds an existing user beyond page 1 case-insensitively', async () => {
    for (let i = 0; i < 1200; i++) harness.db.authUsers.push({ id: uuid(100000 + i), email: `filler${i}@x.edu` });
    harness.db.authUsers.push({ id: uuid(99999), email: 'Late.User@A.edu' });
    harness.signIn(ORG_ADMIN_A);
    const res = await inviteePOST(req('/api/admin/invite', { method: 'POST', body: { email: 'late.user@a.edu', role: 'student', organizationId: ORG_A } }));
    expect(res.status).toBe(200);
    expect(harness.db.invited).toHaveLength(0); // matched the existing account, did not send a new invitation
    expect(rowOf(uuid(99999), ORG_A)).toBeDefined();
  });
});

describe('role requests', () => {
  const REQ = uuid(7001);
  const REQ_USER = uuid(60);
  beforeEach(() => {
    seedRole(REQ_USER, 'student', ORG_A);
    harness.db.authUsers.push({ id: REQ_USER, email: 'req@a.edu' });
    harness.db.seed('role_requests', [{ id: REQ, user_id: REQ_USER, requested_role: 'faculty', status: 'pending', organization_id: ORG_A }]);
  });

  it('approve grants the role once; the second approve is 409 and nothing changes', async () => {
    harness.signIn(ADMIN_A);
    const first = await approvePOST(req(`/api/admin/role-requests/${REQ}/approve`, { method: 'POST' }), params({ id: REQ }));
    expect(first.status).toBe(200);
    expect(rowOf(REQ_USER, ORG_A)).toMatchObject({ role: 'faculty', approval_status: 'approved' });
    expect(harness.db.rows('role_requests')[0].status).toBe('approved');

    const second = await approvePOST(req(`/api/admin/role-requests/${REQ}/approve`, { method: 'POST' }), params({ id: REQ }));
    expect(second.status).toBe(409);
    expect(harness.db.rows('user_roles').filter((r) => r.user_id === REQ_USER)).toHaveLength(1);
    expect(harness.db.rows('audit_logs').filter((a) => a.action === 'role_approve')).toHaveLength(1);
  });

  it('an admin of another org cannot approve; self-approval is forbidden', async () => {
    seedRole(uuid(61), 'admin', ORG_B);
    harness.signIn(uuid(61));
    let res = await approvePOST(req(`/api/admin/role-requests/${REQ}/approve`, { method: 'POST' }), params({ id: REQ }));
    expect(res.status).toBe(403);
    expect(harness.db.rows('role_requests')[0].status).toBe('pending');

    harness.db.seed('role_requests', [{ id: uuid(7002), user_id: ADMIN_A, requested_role: 'faculty', status: 'pending', organization_id: ORG_A }]);
    harness.signIn(ADMIN_A);
    res = await approvePOST(req(`/api/admin/role-requests/${uuid(7002)}/approve`, { method: 'POST' }), params({ id: uuid(7002) }));
    expect(res.status).toBe(403);
  });

  it('platform-level recruiter requests are approvable by super_admin only', async () => {
    harness.db.seed('role_requests', [{ id: uuid(7003), user_id: REQ_USER, requested_role: 'recruiter', status: 'pending', organization_id: null }]);
    harness.signIn(ORG_ADMIN_A);
    let res = await approvePOST(req(`/api/admin/role-requests/${uuid(7003)}/approve`, { method: 'POST' }), params({ id: uuid(7003) }));
    expect(res.status).toBe(403);
    harness.signIn(SUPER);
    res = await approvePOST(req(`/api/admin/role-requests/${uuid(7003)}/approve`, { method: 'POST' }), params({ id: uuid(7003) }));
    expect(res.status).toBe(200);
    expect(rowOf(REQ_USER, null)).toMatchObject({ role: 'recruiter', approval_status: 'approved' });
  });

  it('an admin cannot approve an admin request (hierarchy)', async () => {
    harness.db.seed('role_requests', [{ id: uuid(7004), user_id: REQ_USER, requested_role: 'admin', status: 'pending', organization_id: ORG_A }]);
    harness.signIn(ADMIN_A);
    const res = await approvePOST(req(`/api/admin/role-requests/${uuid(7004)}/approve`, { method: 'POST' }), params({ id: uuid(7004) }));
    expect(res.status).toBe(403);
    expect(harness.db.rows('role_requests').find((r) => r.id === uuid(7004))?.status).toBe('pending');
  });

  it('rolls the request back to pending when the role grant fails', async () => {
    harness.db.failures['user_roles.update'] = { code: 'XX000', message: 'boom' };
    harness.signIn(ADMIN_A);
    const res = await approvePOST(req(`/api/admin/role-requests/${REQ}/approve`, { method: 'POST' }), params({ id: REQ }));
    expect(res.status).toBe(500);
    expect(harness.db.rows('role_requests')[0].status).toBe('pending');
    expect(rowOf(REQ_USER, ORG_A)?.role).toBe('student');
  });

  it('deny claims a pending request once', async () => {
    harness.signIn(ADMIN_A);
    const first = await denyPOST(req(`/api/admin/role-requests/${REQ}/deny`, { method: 'POST' }), params({ id: REQ }));
    expect(first.status).toBe(200);
    const second = await denyPOST(req(`/api/admin/role-requests/${REQ}/deny`, { method: 'POST' }), params({ id: REQ }));
    expect(second.status).toBe(409);
    expect(harness.db.rows('role_requests')[0].status).toBe('rejected');
  });

  it('legacy notifications/role-approval route is gone (410)', async () => {
    harness.signIn(ADMIN_A);
    const res = await notifPOST();
    expect(res.status).toBe(410);
  });
});
