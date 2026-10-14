// @vitest-environment node
import { harness, req } from '../helpers/supabaseHarness';
import { uuid } from '../helpers/fakeSupabase';
import { describe, it, expect, beforeEach } from 'vitest';
import { GET } from '@/app/api/auth/approval-status/route';

const USER = uuid(70);
const ORG = uuid(71);
const ORG2 = uuid(72);

const get = async (role?: string) => (await GET(req(`/api/auth/approval-status${role ? `?role=${role}` : ''}`))) as Response;

beforeEach(() => {
  harness.reset();
  harness.db.seed('organizations', [
    { id: ORG, name: 'Northfield University' },
    { id: ORG2, name: 'Other College' },
  ]);
});

describe('GET /api/auth/approval-status', () => {
  it('is 401 when signed out', async () => {
    harness.signIn(null);
    expect((await get('faculty')).status).toBe(401);
  });

  it('is 400 for a role other than faculty or recruiter', async () => {
    harness.signIn(USER);
    expect((await get('super_admin')).status).toBe(400);
    expect((await get()).status).toBe(400);
  });

  it('reports a pending faculty request with its organization and dates', async () => {
    harness.signIn(USER);
    harness.db.seed('user_roles', [
      { id: uuid(700), user_id: USER, role: 'faculty', organization_id: ORG, approval_status: 'pending', created_at: '2026-02-01T00:00:00Z', approval_notes: null },
    ]);
    const res = await get('faculty');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      role: 'faculty',
      has_role: true,
      organization_id: ORG,
      organization_name: 'Northfield University',
      approval_status: 'pending',
      requested_at: '2026-02-01T00:00:00Z',
    });
  });

  it('shows approval notes and the approved state once an admin has acted', async () => {
    harness.signIn(USER);
    harness.db.seed('user_roles', [
      { id: uuid(701), user_id: USER, role: 'faculty', organization_id: ORG, approval_status: 'approved', created_at: '2026-02-01T00:00:00Z', approved_at: '2026-02-02T00:00:00Z', approval_notes: 'Welcome' },
    ]);
    expect(await (await get('faculty')).json()).toMatchObject({ approval_status: 'approved', approved_at: '2026-02-02T00:00:00Z', approval_notes: 'Welcome' });
  });

  it('only looks at the requested role and only at the caller\'s own rows', async () => {
    harness.signIn(USER);
    harness.db.seed('user_roles', [
      { id: uuid(702), user_id: USER, role: 'student', organization_id: ORG, approval_status: 'approved', created_at: '2026-01-01T00:00:00Z' },
      { id: uuid(703), user_id: uuid(99), role: 'faculty', organization_id: ORG, approval_status: 'approved', created_at: '2026-01-01T00:00:00Z' },
    ]);
    expect(await (await get('faculty')).json()).toMatchObject({ has_role: false, approval_status: null });
  });

  it('with several rows of the role, an approved row wins over a pending one', async () => {
    harness.signIn(USER);
    harness.db.seed('user_roles', [
      { id: uuid(704), user_id: USER, role: 'recruiter', organization_id: null, approval_status: 'pending', created_at: '2026-01-01T00:00:00Z' },
      { id: uuid(705), user_id: USER, role: 'recruiter', organization_id: ORG2, approval_status: 'approved', created_at: '2026-01-02T00:00:00Z' },
    ]);
    expect(await (await get('recruiter')).json()).toMatchObject({ approval_status: 'approved', organization_id: ORG2, organization_name: 'Other College' });
  });

  it('a platform-level recruiter row has no organization name', async () => {
    harness.signIn(USER);
    harness.db.seed('user_roles', [
      { id: uuid(706), user_id: USER, role: 'recruiter', organization_id: null, approval_status: 'denied', created_at: '2026-01-01T00:00:00Z' },
    ]);
    expect(await (await get('recruiter')).json()).toMatchObject({ approval_status: 'denied', organization_id: null, organization_name: null });
  });

  it('is never cached', async () => {
    harness.signIn(USER);
    expect((await get('faculty')).headers.get('cache-control')).toBe('no-store');
  });
});
