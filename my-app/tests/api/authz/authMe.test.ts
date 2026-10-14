// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any */
import { harness } from '../../helpers/supabaseHarness';
import { uuid } from '../../helpers/fakeSupabase';
import { describe, it, expect, beforeEach } from 'vitest';
import { GET as meGET } from '@/app/api/auth/me/route';

const ORG_A = uuid(1);
const ORG_B = uuid(2);
const USER = uuid(40);

beforeEach(() => {
  harness.reset();
  harness.db.seed('profiles', [{ id: USER, email: 'u@a.edu', full_name: 'U Ser', organization_id: ORG_A }]);
});

const me = async () => (await meGET()) as Response;

describe('GET /api/auth/me', () => {
  it('is 401 when signed out', async () => {
    harness.signIn(null);
    expect((await me()).status).toBe(401);
  });

  it('reports the role of a user with a single row', async () => {
    harness.signIn(USER);
    harness.db.seed('user_roles', [
      { id: uuid(600), user_id: USER, role: 'student', organization_id: ORG_A, approval_status: 'approved', created_at: '2026-01-01T00:00:00Z' },
    ]);
    const body = (await (await me()).json()) as any;
    expect(body).toMatchObject({ user_id: USER, role: 'student', organization_id: ORG_A, approval_status: 'approved', full_name: 'U Ser' });
  });

  it('does not lose the role when the user holds several rows (platform row plus an organization row)', async () => {
    harness.signIn(USER);
    harness.db.seed('user_roles', [
      { id: uuid(601), user_id: USER, role: 'recruiter', organization_id: null, approval_status: 'approved', created_at: '2026-01-01T00:00:00Z' },
      { id: uuid(602), user_id: USER, role: 'recruiter', organization_id: ORG_B, approval_status: 'approved', created_at: '2026-01-02T00:00:00Z' },
    ]);
    const body = (await (await me()).json()) as any;
    expect(body.role).toBe('recruiter');
    expect(body.approval_status).toBe('approved');
  });

  it('picks the highest approved role and ignores a higher but pending one', async () => {
    harness.signIn(USER);
    harness.db.seed('user_roles', [
      { id: uuid(603), user_id: USER, role: 'student', organization_id: ORG_A, approval_status: 'approved', created_at: '2026-01-01T00:00:00Z' },
      { id: uuid(604), user_id: USER, role: 'faculty', organization_id: ORG_B, approval_status: 'approved', created_at: '2026-01-02T00:00:00Z' },
      { id: uuid(605), user_id: USER, role: 'org_admin', organization_id: ORG_A, approval_status: 'pending', created_at: '2026-01-03T00:00:00Z' },
    ]);
    const body = (await (await me()).json()) as any;
    expect(body).toMatchObject({ role: 'faculty', organization_id: ORG_B, approval_status: 'approved' });
  });

  it('reports a pending row (so the UI can say "awaiting approval") when nothing is approved', async () => {
    harness.signIn(USER);
    harness.db.seed('user_roles', [
      { id: uuid(606), user_id: USER, role: 'faculty', organization_id: ORG_A, approval_status: 'pending', created_at: '2026-01-01T00:00:00Z' },
    ]);
    const body = (await (await me()).json()) as any;
    expect(body).toMatchObject({ role: 'faculty', approval_status: 'pending' });
  });

  it('returns null role and the profile name for a user without any role row', async () => {
    harness.signIn(USER);
    const body = (await (await me()).json()) as any;
    expect(body).toMatchObject({ role: null, approval_status: null, full_name: 'U Ser', organization_id: ORG_A });
  });
});
