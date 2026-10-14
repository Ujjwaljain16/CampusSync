// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSupabaseAdminClient, createSupabaseServerClient } from '@/lib/supabaseServer';
import { resetVisibilityWarningForTests } from '@/lib/privacy/visibility';
import { GET, POST } from '@/app/api/recruiter/search-students/route';
import { adminClient, jsonRequest, newUserId, ORG_A, recruiterSessionClient, STUDENT_1, STUDENT_2 } from './helpers/fixture';
import type { QueryState } from '../privacy/helpers/mockSupabase';

vi.mock('@/lib/supabaseServer', () => ({
  createSupabaseServerClient: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
}));

const profiles = [
  { id: STUDENT_1, full_name: 'Asha Rao', email: 'asha@uni.edu', university: 'Uni', graduation_year: 2026, major: 'CS', gpa: 9.1, location: 'Pune', organization_id: ORG_A, created_at: '2025-01-01T00:00:00Z' },
  { id: STUDENT_2, full_name: 'Bo Li', email: null, university: 'Uni', graduation_year: 2025, major: 'EE', gpa: 8.5, location: 'Delhi', organization_id: ORG_A, created_at: '2025-01-02T00:00:00Z' },
];

function setup(opts: { share?: string[]; userId?: string } = {}) {
  const userId = opts.userId ?? newUserId();
  const session = recruiterSessionClient({ userId });
  const admin = adminClient({
    profiles: (s: QueryState) => {
      if (String(s.find('select')?.args[0]).includes('recruiter_share_contact')) {
        const ids = (s.find('in', 'id')?.args[1] as string[]) ?? [];
        return { data: ids.map((id) => ({ id, public_portfolio_enabled: false, recruiter_share_contact: (opts.share ?? []).includes(id) })) };
      }
      return { data: profiles };
    },
    user_roles: () => ({ data: profiles.map((p) => ({ user_id: p.id, organization_id: ORG_A })) }),
    certificates: () => ({
      data: [{ id: 'c1', title: 'Python Basics', institution: 'Uni', date_issued: '2025-05-01', student_id: STUDENT_1, description: 'RAW', confidence_score: 1 }],
    }),
    audit_logs: () => ({ data: null }),
  });
  vi.mocked(createSupabaseServerClient).mockResolvedValue(session as never);
  vi.mocked(createSupabaseAdminClient).mockResolvedValue(admin as never);
  return { admin, userId };
}

const get = (qs = '') => GET(jsonRequest(`http://localhost/api/recruiter/search-students${qs}`, 'GET'), undefined);
const post = (body: unknown) => POST(jsonRequest('http://localhost/api/recruiter/search-students', 'POST', body), undefined);

describe('recruiter search-students', () => {
  beforeEach(() => {
    resetVisibilityWarningForTests();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('clamps limit to 1..50', async () => {
    setup();
    expect((await (await get('?limit=1000')).json()).data.pagination.limit).toBe(50);
    expect((await (await get('?limit=0')).json()).data.pagination.limit).toBe(1);
    expect((await (await get('?limit=-7')).json()).data.pagination.limit).toBe(1);
    expect((await (await get('?limit=abc')).json()).data.pagination.limit).toBe(20);
  });

  it('paginates in the database (range) and restricts to the recruiter orgs', async () => {
    const { admin } = setup();
    await get();
    const q = admin.callsFor('profiles')[0];
    expect(q.find('range')?.args).toEqual([0, 49]);
    expect(q.find('in', 'organization_id')?.args[1]).toEqual([ORG_A]);
  });

  it('returns students without contact details, GPA, fabricated e-mail or cert internals by default', async () => {
    setup();
    const { data } = await (await get()).json();
    expect(data.students).toHaveLength(2);
    for (const s of data.students) {
      for (const key of ['email', 'gpa', 'phone']) expect(s).not.toHaveProperty(key);
      expect(s.contact_shared).toBe(false);
    }
    const serialized = JSON.stringify(data);
    expect(serialized).not.toContain('example.com');
    expect(serialized).not.toContain('asha@uni.edu');
    expect(serialized).not.toContain('RAW');
    expect(serialized).not.toContain('confidence');
    expect(data.students[0].certifications[0]).toEqual({
      id: 'c1', title: 'Python Basics', institution: 'Uni', date_issued: '2025-05-01', verification_status: 'verified',
    });
  });

  it('includes e-mail and GPA only for students who opted in, and never invents an address', async () => {
    setup({ share: [STUDENT_1, STUDENT_2] });
    const { data } = await (await get()).json();
    const asha = data.students.find((s: { id: string }) => s.id === STUDENT_1);
    const bo = data.students.find((s: { id: string }) => s.id === STUDENT_2);
    expect(asha.email).toBe('asha@uni.edu');
    expect(asha.gpa).toBe(9.1);
    expect(bo).not.toHaveProperty('email'); // profile has none -> omitted, not fabricated
  });

  it('min_gpa cannot be used to probe the GPA of students who do not share it', async () => {
    setup({ share: [STUDENT_2] });
    const { data } = await (await get('?min_gpa=8')).json();
    expect(data.students.map((s: { id: string }) => s.id)).toEqual([STUDENT_2]);
  });

  it('neutralises PostgREST filter injection in q', async () => {
    const { admin } = setup();
    const res = await get(`?q=${encodeURIComponent('x,id.neq.0),(email.ilike.%')}`);
    expect(res.status).toBe(200);
    const orFilter = String(admin.callsFor('profiles')[0].find('or')?.args[0]);
    expect(orFilter.split(',')).toHaveLength(3); // exactly the three intended conditions
    expect(orFilter).not.toContain('id.neq');
    expect(orFilter).not.toContain('email.ilike');
    expect(orFilter).not.toMatch(/[()]/);
  });

  it('does not search on e-mail (a hidden field)', async () => {
    const { admin } = setup();
    await get('?q=asha');
    expect(String(admin.callsFor('profiles')[0].find('or')?.args[0])).not.toContain('email');
  });

  it('writes one audit row per search page', async () => {
    const { admin, userId } = setup();
    await get('?q=asha');
    const audits = admin.callsFor('audit_logs');
    expect(audits).toHaveLength(1);
    expect(audits[0].payload).toMatchObject({ user_id: userId, organization_id: ORG_A, action: 'recruiter_search_students' });
  });

  it('POST: non-array / mistyped bodies are 400, never 500', async () => {
    setup();
    for (const body of [[1, 2, 3], 'just a string', 42, null, { skills: 'python' }, { institutions: { a: 1 } }, { limit: 'many' }, { has_certificates: 'yes' }]) {
      const res = await post(body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(JSON.stringify(await res.json())).not.toMatch(/TypeError|Cannot read/);
    }
    const bad = await POST(jsonRequest('http://localhost/api/recruiter/search-students', 'POST', '{not json'), undefined);
    expect(bad.status).toBe(400);
  });

  it('POST: sanitises terms, clamps limit and filters by certificate title', async () => {
    const { admin } = setup();
    const res = await post({ skills: ['python)'], institutions: ['Uni),(id.neq.0'], limit: 5000 });
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.pagination.limit).toBe(50);
    expect(data.students.map((s: { id: string }) => s.id)).toEqual([STUDENT_1]);
    expect(String(admin.callsFor('profiles')[0].find('or')?.args[0])).not.toMatch(/[()]/);
  });

  it('is rate limited per recruiter', async () => {
    setup({ userId: '99999999-9999-4999-8999-aaaaaaaaaaaa' });
    let last = 200;
    for (let i = 0; i < 25; i++) last = (await get()).status;
    expect(last).toBe(429);
  });

  it('rejects an invalid X-Organization-ID header', async () => {
    setup();
    const res = await GET(jsonRequest('http://localhost/api/recruiter/search-students', 'GET', undefined, { 'X-Organization-ID': 'x" or 1=1' }), undefined);
    expect(res.status).toBe(400);
  });
});
