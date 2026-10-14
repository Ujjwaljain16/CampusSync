// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any */
import { harness, req } from '../../helpers/supabaseHarness';
import { uuid } from '../../helpers/fakeSupabase';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { GET as approvalHistoryGET } from '@/app/api/certificates/approval-history/route';
import { GET as adminDashboardGET } from '@/app/api/admin/dashboard/route';

const ORG_A = uuid(1);
const ORG_B = uuid(2);
const FACULTY = uuid(10); // faculty in A, plus a second role row (student in B)
const OUTSIDER = uuid(11);
const ADMIN = uuid(12);
const PENDING = uuid(13);
const CERT = uuid(30);
const STUDENT = uuid(40);

let seq = 0;
function role(userId: string, roleName: string, org: string | null, extra: Record<string, unknown> = {}) {
  return {
    id: uuid(6000 + ++seq),
    user_id: userId,
    role: roleName,
    organization_id: org,
    approval_status: 'approved',
    created_at: `2026-01-${String(10 + seq).padStart(2, '0')}T00:00:00Z`,
    ...extra,
  };
}

beforeEach(() => {
  harness.reset();
  seq = 0;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  harness.db.seed('user_roles', [
    role(FACULTY, 'faculty', ORG_A),
    role(FACULTY, 'student', ORG_B),
    role(OUTSIDER, 'faculty', ORG_B),
    role(ADMIN, 'admin', ORG_A),
    role(PENDING, 'faculty', ORG_A, { approval_status: 'pending' }),
  ]);
  harness.db.seed('certificates', [
    { id: CERT, title: 'T', institution: 'I', student_id: STUDENT, verification_status: 'verified', created_at: '2026-01-03' },
  ]);
  harness.db.seed('audit_logs', [
    { id: uuid(100), actor_id: FACULTY, organization_id: ORG_A, action: 'manual_approve', target_type: 'certificate', target_id: CERT, details: {}, created_at: '2026-01-04T00:00:00Z' },
    { id: uuid(101), actor_id: OUTSIDER, organization_id: ORG_B, action: 'manual_approve', target_type: 'certificate', target_id: uuid(31), details: {}, created_at: '2026-01-05T00:00:00Z' },
  ]);
});

describe('GET /api/certificates/approval-history', () => {
  it('works for a user with several role rows (no .single() on user_roles) and is org scoped', async () => {
    harness.signIn(FACULTY);
    const res = await approvalHistoryGET(req('/api/certificates/approval-history'));
    expect(res.status).toBe(200);
    const approvals = ((await res.json()) as any).data.approvals;
    expect(approvals).toHaveLength(1);
    expect(approvals[0]).toMatchObject({ action: 'manual_approve', certificateId: CERT, approverRole: 'faculty' });
    expect(approvals[0].certificate.title).toBe('T');
  });

  it('refuses an organization the caller has no approved role in', async () => {
    harness.signIn(OUTSIDER);
    const res = await approvalHistoryGET(req('/api/certificates/approval-history', { headers: { 'X-Organization-ID': ORG_A } }));
    expect(res.status).toBe(403);
  });

  it('is open to an org admin of the organization and to a super admin, but only for their own scope', async () => {
    const ORG_ADMIN = uuid(14);
    const SUPER = uuid(15);
    harness.db.seed('user_roles', [role(ORG_ADMIN, 'org_admin', ORG_A), role(SUPER, 'super_admin', null)]);

    harness.signIn(ORG_ADMIN);
    const own = await approvalHistoryGET(req('/api/certificates/approval-history'));
    expect(own.status).toBe(200);
    expect(((await own.json()) as any).data.approvals).toHaveLength(1);

    const foreign = await approvalHistoryGET(req('/api/certificates/approval-history', { headers: { 'X-Organization-ID': ORG_B } }));
    expect(foreign.status).toBe(403);

    harness.signIn(SUPER);
    const asSuper = await approvalHistoryGET(req('/api/certificates/approval-history', { headers: { 'X-Organization-ID': ORG_A } }));
    expect(asSuper.status).toBe(200);
  });

  it('does not count a pending role row', async () => {
    harness.signIn(PENDING);
    const res = await approvalHistoryGET(req('/api/certificates/approval-history'));
    expect([401, 403]).toContain(res.status);
  });

  it('selects target_type/target_id and not the never-written target_user_id', () => {
    // the in-memory fake ignores column lists, so assert on the query text
    const src = readFileSync('src/app/api/certificates/approval-history/route.ts', 'utf8');
    expect(src).not.toContain('target_user_id');
    expect(src).toContain('target_type');
    expect(src).not.toContain('.single()');
  });
});

describe('GET /api/admin/dashboard', () => {
  it('returns recent activity keyed by actor_id for the caller organization', async () => {
    harness.signIn(ADMIN);
    const res = await adminDashboardGET(req('/api/admin/dashboard'));
    expect(res.status).toBe(200);
    const activity = ((await res.json()) as any).data.recent_activity;
    expect(activity).toHaveLength(1);
    expect(activity[0].actor_id).toBe(FACULTY);
  });

  it('does not select the legacy user_id audit column', () => {
    const src = readFileSync('src/app/api/admin/dashboard/route.ts', 'utf8');
    expect(src).not.toMatch(/user_id/);
  });
});
