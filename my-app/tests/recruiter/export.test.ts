// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSupabaseAdminClient, createSupabaseServerClient } from '@/lib/supabaseServer';
import { resetVisibilityWarningForTests } from '@/lib/privacy/visibility';
import { POST } from '@/app/api/recruiter/export/route';
import { adminClient, jsonRequest, newUserId, ORG_A, recruiterSessionClient, STUDENT_1, STUDENT_2 } from './helpers/fixture';
import type { QueryState } from '../privacy/helpers/mockSupabase';

vi.mock('@/lib/supabaseServer', () => ({
  createSupabaseServerClient: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
}));

function setup(share: string[] = []) {
  const userId = newUserId();
  vi.mocked(createSupabaseServerClient).mockResolvedValue(recruiterSessionClient({ userId }) as never);
  const admin = adminClient({
    user_roles: (s: QueryState) => ({
      // only STUDENT_1 is an approved student of the recruiter's org
      data: ((s.find('in', 'user_id')?.args[1] as string[]) ?? []).filter((id) => id === STUDENT_1).map((id) => ({ user_id: id, organization_id: ORG_A })),
    }),
    profiles: (s: QueryState) => {
      if (String(s.find('select')?.args[0]).includes('recruiter_share_contact')) {
        const ids = (s.find('in', 'id')?.args[1] as string[]) ?? [];
        return { data: ids.map((id) => ({ id, recruiter_share_contact: share.includes(id) })) };
      }
      const ids = (s.find('in', 'id')?.args[1] as string[]) ?? [];
      return { data: ids.map((id) => ({ id, full_name: 'Asha Rao', email: 'asha@uni.edu', created_at: '2025-01-01' })) };
    },
    certificates: () => ({ data: [{ id: 'c1', title: 'T', institution: 'I', date_issued: '2025-01-01', student_id: STUDENT_1, confidence_score: 0.4 }] }),
    audit_logs: () => ({ data: null }),
  });
  vi.mocked(createSupabaseAdminClient).mockResolvedValue(admin as never);
  return { admin, userId };
}

const call = (body: unknown) => POST(jsonRequest('http://localhost/api/recruiter/export', 'POST', body), undefined);
const uuid = (n: number) => `44444444-4444-4444-8444-${String(n).padStart(12, '0')}`;

describe('POST /api/recruiter/export', () => {
  beforeEach(() => {
    resetVisibilityWarningForTests();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('caps studentIds at 100', async () => {
    setup();
    const ok = await call({ studentIds: Array.from({ length: 100 }, (_, i) => uuid(i)), format: 'json' });
    expect(ok.status).toBe(200);
    const tooMany = await call({ studentIds: Array.from({ length: 101 }, (_, i) => uuid(i)), format: 'json' });
    expect(tooMany.status).toBe(400);
  });

  it('validates body shape and UUIDs', async () => {
    for (const body of [null, [], 'x', {}, { studentIds: 'abc', format: 'json' }, { studentIds: [], format: 'json' },
      { studentIds: ['nope'], format: 'json' }, { studentIds: [STUDENT_1] }, { studentIds: [STUDENT_1], format: 'xml' },
      { studentIds: [STUDENT_1], format: 'json', includeCredentials: 'yes' }, { studentIds: [STUDENT_1], format: 'json', filters: [] }]) {
      setup(); // fresh recruiter each time: the export route is rate limited
      expect((await call(body)).status, JSON.stringify(body)).toBe(400);
    }
  });

  it('exports only eligible students, omits e-mail without consent, strips credential internals', async () => {
    setup();
    const res = await call({ studentIds: [STUDENT_1, STUDENT_2], format: 'json', includeCredentials: true });
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.total_records).toBe(1);
    expect(data.data[0].id).toBe(STUDENT_1);
    expect(data.data[0]).not.toHaveProperty('email');
    expect(JSON.stringify(data)).not.toContain('confidence');
  });

  it('includes e-mail for students who opted in and writes one audit row', async () => {
    const { admin } = setup([STUDENT_1]);
    const { data } = await (await call({ studentIds: [STUDENT_1], format: 'csv' })).json();
    expect(data.data[0].email).toBe('asha@uni.edu');
    const audits = admin.callsFor('audit_logs');
    expect(audits).toHaveLength(1);
    expect(audits[0].payload).toMatchObject({ action: 'recruiter_export_students', organization_id: ORG_A });
  });

  it('queries certificates as verified-only', async () => {
    const { admin } = setup();
    await call({ studentIds: [STUDENT_1], format: 'json', includeCredentials: true });
    expect(admin.callsFor('certificates')[0].eq('verification_status')).toBe('verified');
  });
});
