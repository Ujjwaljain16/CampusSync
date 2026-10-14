// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any */
import { harness, req, params } from '../../helpers/supabaseHarness';
import { uuid } from '../../helpers/fakeSupabase';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { POST as recruiterSignupPOST } from '@/app/api/auth/signup/recruiter/route';
import { POST as studentFacultySignupPOST } from '@/app/api/auth/signup/student-faculty/route';
import { POST as addAdminPOST } from '@/app/api/v2/admin/super/organizations/[orgId]/admins/add/route';
import { GET as rolesGET } from '@/app/api/admin/roles/route';

const ORG_A = uuid(1);
const SUPER = uuid(12);
const ADMIN_A = uuid(13);

// profiles.role is dropped by the schema cleanup: nothing may write it, and nothing may use it for authorization.
const noRoleColumn = (row: Record<string, unknown>) => expect(Object.keys(row)).not.toContain('role');

beforeEach(() => {
  harness.reset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  harness.db.seed('organizations', [
    { id: ORG_A, name: 'A', is_active: true, settings: { allowed_email_domains: ['a.edu'] }, created_at: '2026-01-01' },
  ]);
  harness.db.seed('user_roles', [
    { id: uuid(500), user_id: SUPER, role: 'super_admin', organization_id: null, approval_status: 'approved', created_at: '2026-01-01T00:00:00Z' },
    { id: uuid(501), user_id: ADMIN_A, role: 'admin', organization_id: ORG_A, approval_status: 'approved', created_at: '2026-01-02T00:00:00Z' },
  ]);
});

describe('recruiter signup writes the profile row', () => {
  it('stores company_name and phone on profiles, and no role / company columns', async () => {
    const res = await recruiterSignupPOST(
      req('/api/auth/signup/recruiter', {
        method: 'POST',
        body: { email: 'rec@corp.com', password: 'longenough1', full_name: 'Rec Ruiter', company_name: ' Corp Inc ', phone: ' +91 99999 ' },
      })
    );
    expect(res.status).toBe(201);
    const profiles = harness.db.rows('profiles');
    expect(profiles).toHaveLength(1);
    expect(profiles[0]).toMatchObject({ email: 'rec@corp.com', full_name: 'Rec Ruiter', company_name: 'Corp Inc', phone: '+91 99999', organization_id: null });
    noRoleColumn(profiles[0]);
    expect(Object.keys(profiles[0])).not.toContain('company');
    // authorization still comes from user_roles
    const roles = harness.db.rows('user_roles').filter((r) => r.user_id === profiles[0].id);
    expect(roles).toMatchObject([{ role: 'recruiter', organization_id: null, approval_status: 'pending' }]);
  });

  it('writes a null phone when none is given and survives a profile row created by the signup trigger', async () => {
    // the auth.users trigger may have inserted the profile already: upsert, not insert
    harness.db.seed('profiles', [{ id: '00000000-0000-4000-8000-000000800000', email: 'rec2@corp.com' }]);
    harness.db.authUsers.length = 0;
    const res = await recruiterSignupPOST(
      req('/api/auth/signup/recruiter', {
        method: 'POST',
        body: { email: 'rec2@corp.com', password: 'longenough1', full_name: 'R Two', company_name: 'Corp' },
      })
    );
    expect(res.status).toBe(201);
    const profiles = harness.db.rows('profiles');
    expect(profiles).toHaveLength(1);
    expect(profiles[0]).toMatchObject({ company_name: 'Corp', phone: null });
  });
});

describe('student / faculty signup writes the profile row', () => {
  it.each(['student', 'faculty'])('does not write profiles.role for a %s', async (role) => {
    const res = await studentFacultySignupPOST(
      req('/api/auth/signup/student-faculty', {
        method: 'POST',
        body: { email: 'kid@a.edu', password: 'longenough1', full_name: 'Kid', role, organization_id: ORG_A, university: 'A' },
      })
    );
    expect(res.status).toBe(201);
    const profiles = harness.db.rows('profiles');
    expect(profiles).toHaveLength(1);
    expect(profiles[0]).toMatchObject({ email: 'kid@a.edu', organization_id: ORG_A, university: 'A' });
    noRoleColumn(profiles[0]);
    const granted = harness.db.rows('user_roles').find((r) => r.user_id === profiles[0].id);
    expect(granted).toMatchObject({ role, organization_id: ORG_A, approval_status: role === 'faculty' ? 'pending' : 'approved' });
  });
});

describe('adding an organization admin', () => {
  it('creates the new user profile without a role column', async () => {
    harness.signIn(SUPER);
    const res = await addAdminPOST(
      req(`/api/v2/admin/super/organizations/${ORG_A}/admins/add`, {
        method: 'POST',
        body: { email: 'fresh@a.edu', full_name: 'Fresh Admin', role: 'org_admin', password: 'longenough1' },
      }),
      params({ orgId: ORG_A })
    );
    expect(res.status).toBe(201);
    const profile = harness.db.rows('profiles').find((p) => p.email === 'fresh@a.edu');
    expect(profile).toBeTruthy();
    noRoleColumn(profile!);
    expect(harness.db.rows('user_roles').some((r) => r.user_id === profile!.id && r.role === 'org_admin')).toBe(true);
  });
});

describe('GET /api/admin/roles', () => {
  it('no longer asks for user_roles.is_super_admin; super admin is identified by role', async () => {
    harness.signIn(SUPER);
    const res = await rolesGET(req('/api/admin/roles'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    const users = body.data?.users ?? body.users ?? body.data;
    const list = Array.isArray(users) ? users : [];
    expect(list.length).toBeGreaterThan(0);
    for (const u of list) expect(Object.keys(u)).not.toContain('is_super_admin');
    expect(list.some((u: any) => u.role === 'super_admin')).toBe(true);
  });
});
