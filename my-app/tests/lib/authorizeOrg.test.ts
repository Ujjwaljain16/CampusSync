// @vitest-environment node
import { harness } from '../helpers/supabaseHarness';
import { uuid } from '../helpers/fakeSupabase';
import { describe, it, expect, beforeEach } from 'vitest';
import { authorizeOrg, assertSuperAdmin, getOrganizationContext, isRecruiterContext } from '@/lib/api';
import { requireRole, getServerUserWithRole } from '@/lib/supabaseServer';
import { checkRoleChange } from '@/lib/api/utils/roles';
import type { User } from '@supabase/supabase-js';

const ORG_A = uuid(1);
const ORG_B = uuid(2);
const U = uuid(100);
const user = { id: U, email: 'u@test.edu' } as User;

function role(row: Record<string, unknown>) {
  return { user_id: U, approval_status: 'approved', created_at: '2026-01-01T00:00:00Z', ...row };
}

async function status(p: Promise<unknown>): Promise<number | 'ok'> {
  try {
    await p;
    return 'ok';
  } catch (e) {
    if (e instanceof Response) return e.status;
    throw e;
  }
}

beforeEach(() => {
  harness.reset();
  harness.signIn(U);
});

describe('authorizeOrg matrix', () => {
  it('allows an approved admin in the requested org', async () => {
    harness.db.seed('user_roles', [role({ role: 'admin', organization_id: ORG_A })]);
    const res = await authorizeOrg(user, { orgId: ORG_A, minRole: 'admin' });
    expect(res.ok).toBe(true);
    expect(res.role).toBe('admin');
    expect(res.isSuperAdmin).toBe(false);
  });

  it('confused deputy: admin in A + student in B targeting B -> 403', async () => {
    harness.db.seed('user_roles', [
      role({ role: 'admin', organization_id: ORG_A, created_at: '2026-01-01T00:00:00Z' }),
      role({ role: 'student', organization_id: ORG_B, created_at: '2026-01-02T00:00:00Z' }),
    ]);
    expect(await status(authorizeOrg(user, { orgId: ORG_B, minRole: 'admin' }))).toBe(403);
    expect(await status(authorizeOrg(user, { orgId: ORG_A, minRole: 'admin' }))).toBe('ok');
  });

  it('rejects a pending admin', async () => {
    harness.db.seed('user_roles', [role({ role: 'admin', organization_id: ORG_A, approval_status: 'pending' })]);
    expect(await status(authorizeOrg(user, { orgId: ORG_A, minRole: 'admin' }))).toBe(403);
  });

  it('rejects a denied admin', async () => {
    harness.db.seed('user_roles', [role({ role: 'org_admin', organization_id: ORG_A, approval_status: 'denied' })]);
    expect(await status(authorizeOrg(user, { orgId: ORG_A, minRole: 'admin' }))).toBe(403);
  });

  it('tolerates several rows in the same org and uses the highest', async () => {
    // not possible with the production unique constraint, but the code must not break
    harness.db.tables['user_roles'] = [
      role({ role: 'student', organization_id: ORG_A }),
      role({ role: 'org_admin', organization_id: ORG_A, created_at: '2026-02-01T00:00:00Z' }),
    ];
    const res = await authorizeOrg(user, { orgId: ORG_A, minRole: 'admin' });
    expect(res.role).toBe('org_admin');
  });

  it('super_admin passes for any org (and for org that has no rows)', async () => {
    harness.db.seed('user_roles', [role({ role: 'super_admin', organization_id: null })]);
    const res = await authorizeOrg(user, { orgId: ORG_B, minRole: 'org_admin' });
    expect(res.isSuperAdmin).toBe(true);
    await expect(assertSuperAdmin(user)).resolves.toBeUndefined();
  });

  it('a pending super_admin is not a super_admin', async () => {
    harness.db.seed('user_roles', [role({ role: 'super_admin', organization_id: null, approval_status: 'pending' })]);
    expect(await status(authorizeOrg(user, { orgId: ORG_B, minRole: 'admin' }))).toBe(403);
    expect(await status(assertSuperAdmin(user))).toBe(403);
  });

  it('user without rows -> 403; malformed org id -> 400', async () => {
    expect(await status(authorizeOrg(user, { orgId: ORG_A, minRole: 'student' }))).toBe(403);
    expect(await status(authorizeOrg(user, { orgId: 'not-a-uuid' }))).toBe(400);
  });

  it('roles allow-list works and minRole ranks correctly', async () => {
    harness.db.seed('user_roles', [role({ role: 'faculty', organization_id: ORG_A })]);
    expect(await status(authorizeOrg(user, { orgId: ORG_A, roles: ['faculty'] }))).toBe('ok');
    expect(await status(authorizeOrg(user, { orgId: ORG_A, roles: ['admin'] }))).toBe(403);
    expect(await status(authorizeOrg(user, { orgId: ORG_A, minRole: 'admin' }))).toBe(403);
  });
});

describe('getOrganizationContext determinism', () => {
  it('without requested org picks the highest approved role, not the earliest row', async () => {
    harness.db.seed('user_roles', [
      role({ role: 'student', organization_id: ORG_B, created_at: '2026-01-01T00:00:00Z' }),
      role({ role: 'admin', organization_id: ORG_A, created_at: '2026-03-01T00:00:00Z' }),
    ]);
    const ctx = await getOrganizationContext(user);
    expect(isRecruiterContext(ctx)).toBe(false);
    if (!isRecruiterContext(ctx)) {
      expect(ctx.organizationId).toBe(ORG_A);
      expect(ctx.role).toBe('admin');
      expect(ctx.isOrgAdmin).toBe(true);
    }
  });

  it('ignores a pending higher role', async () => {
    harness.db.seed('user_roles', [
      role({ role: 'student', organization_id: ORG_B }),
      role({ role: 'org_admin', organization_id: ORG_A, approval_status: 'pending' }),
    ]);
    const ctx = await getOrganizationContext(user);
    if (!isRecruiterContext(ctx)) {
      expect(ctx.organizationId).toBe(ORG_B);
      expect(ctx.isOrgAdmin).toBe(false);
    }
  });

  it('with requested org: role is that org\'s role (admin in A, student in B)', async () => {
    harness.db.seed('user_roles', [
      role({ role: 'admin', organization_id: ORG_A }),
      role({ role: 'student', organization_id: ORG_B }),
    ]);
    const ctxB = await getOrganizationContext(user, ORG_B);
    if (!isRecruiterContext(ctxB)) {
      expect(ctxB.role).toBe('student');
      expect(ctxB.isOrgAdmin).toBe(false);
      expect(ctxB.organizationId).toBe(ORG_B);
    }
    const ctxA = await getOrganizationContext(user, ORG_A);
    if (!isRecruiterContext(ctxA)) expect(ctxA.isOrgAdmin).toBe(true);
  });

  it('with requested org the user has no access to -> 403', async () => {
    harness.db.seed('user_roles', [role({ role: 'admin', organization_id: ORG_A })]);
    expect(await status(getOrganizationContext(user, ORG_B))).toBe(403);
  });

  it('multiple rows in the requested org do not error (.single() removed)', async () => {
    harness.db.tables['user_roles'] = [
      role({ role: 'student', organization_id: ORG_A }),
      role({ role: 'faculty', organization_id: ORG_A, created_at: '2026-02-01T00:00:00Z' }),
    ];
    const ctx = await getOrganizationContext(user, ORG_A);
    if (!isRecruiterContext(ctx)) expect(ctx.role).toBe('faculty');
  });

  it('only pending rows -> 403', async () => {
    harness.db.seed('user_roles', [role({ role: 'admin', organization_id: ORG_A, approval_status: 'pending' })]);
    expect(await status(getOrganizationContext(user))).toBe(403);
  });

  it('super_admin may request any existing org', async () => {
    harness.db.seed('user_roles', [role({ role: 'super_admin', organization_id: null })]);
    harness.db.seed('organizations', [{ id: ORG_B, is_active: true, created_at: '2026-01-01' }]);
    const ctx = await getOrganizationContext(user, ORG_B);
    if (!isRecruiterContext(ctx)) {
      expect(ctx.isSuperAdmin).toBe(true);
      expect(ctx.organizationId).toBe(ORG_B);
    }
    expect(await status(getOrganizationContext(user, uuid(999)))).toBe(404);
  });

  it('platform recruiter gets a RecruiterContext limited to approved orgs', async () => {
    harness.db.seed('user_roles', [
      role({ role: 'recruiter', organization_id: null }),
      role({ role: 'recruiter', organization_id: ORG_A }),
      role({ role: 'recruiter', organization_id: ORG_B, approval_status: 'pending' }),
    ]);
    const ctx = await getOrganizationContext(user);
    expect(isRecruiterContext(ctx)).toBe(true);
    if (isRecruiterContext(ctx)) expect(ctx.accessibleOrganizations).toEqual([ORG_A]);
    expect(await status(getOrganizationContext(user, ORG_B))).toBe(403);
  });
});

describe('requireRole / getServerUserWithRole determinism', () => {
  it('a pending top row does not hide an approved lower row', async () => {
    harness.db.seed('user_roles', [
      role({ role: 'org_admin', organization_id: ORG_A, approval_status: 'pending' }),
      role({ role: 'faculty', organization_id: ORG_B }),
    ]);
    const r = await getServerUserWithRole();
    expect(r?.role).toBe('faculty');
    expect((await requireRole(['faculty'])).authorized).toBe(true);
    expect((await requireRole(['org_admin'])).authorized).toBe(false);
  });

  it('only pending/denied rows keep the existing "awaiting approval" error', async () => {
    harness.db.seed('user_roles', [role({ role: 'admin', organization_id: ORG_A, approval_status: 'denied' })]);
    const r = await requireRole(['admin']);
    expect(r.authorized).toBe(false);
    expect(r.message).toMatch(/awaiting approval or access was denied/);
  });

  it('highest approved wins regardless of creation order', async () => {
    harness.db.seed('user_roles', [
      role({ role: 'student', organization_id: ORG_A, created_at: '2026-01-01T00:00:00Z' }),
      role({ role: 'admin', organization_id: ORG_B, created_at: '2026-06-01T00:00:00Z' }),
    ]);
    expect((await requireRole(['admin'])).authorized).toBe(true);
  });

  it('unauthenticated -> not authorized', async () => {
    harness.signIn(null);
    const r = await requireRole(['admin']);
    expect(r.authorized).toBe(false);
    expect(r.message).toBe('Authentication required');
  });
});

describe('role hierarchy (checkRoleChange)', () => {
  const base = { actorId: uuid(1), targetUserId: uuid(2) };

  it('admin cannot grant org_admin, admin or super_admin', () => {
    for (const newRole of ['org_admin', 'admin', 'super_admin']) {
      expect(checkRoleChange({ ...base, actorRole: 'admin', targetCurrentRole: 'student', newRole }).ok).toBe(false);
    }
    expect(checkRoleChange({ ...base, actorRole: 'admin', targetCurrentRole: 'student', newRole: 'faculty' }).ok).toBe(true);
  });

  it('admin cannot modify or remove another admin / org_admin', () => {
    expect(checkRoleChange({ ...base, actorRole: 'admin', targetCurrentRole: 'admin', newRole: 'student' }).ok).toBe(false);
    expect(checkRoleChange({ ...base, actorRole: 'admin', targetCurrentRole: 'org_admin', newRole: null }).ok).toBe(false);
  });

  it('org_admin can grant admin but not org_admin; super_admin can grant org_admin', () => {
    expect(checkRoleChange({ ...base, actorRole: 'org_admin', targetCurrentRole: 'student', newRole: 'admin' }).ok).toBe(true);
    expect(checkRoleChange({ ...base, actorRole: 'org_admin', targetCurrentRole: 'student', newRole: 'org_admin' }).ok).toBe(false);
    expect(checkRoleChange({ ...base, actorRole: 'super_admin', targetCurrentRole: 'student', newRole: 'org_admin' }).ok).toBe(true);
  });

  it('nobody changes or removes their own role, unknown roles rejected', () => {
    const self = { actorId: uuid(1), targetUserId: uuid(1) };
    expect(checkRoleChange({ ...self, actorRole: 'super_admin', targetCurrentRole: 'super_admin', newRole: 'student' }).ok).toBe(false);
    expect(checkRoleChange({ ...self, actorRole: 'org_admin', targetCurrentRole: 'org_admin', newRole: null }).ok).toBe(false);
    const bad = checkRoleChange({ ...base, actorRole: 'super_admin', targetCurrentRole: null, newRole: 'root' });
    expect(bad).toMatchObject({ ok: false, status: 422 });
  });
});
