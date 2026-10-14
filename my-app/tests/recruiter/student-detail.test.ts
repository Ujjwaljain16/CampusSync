// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSupabaseAdminClient, createSupabaseServerClient } from '@/lib/supabaseServer';
import { resetVisibilityWarningForTests } from '@/lib/privacy/visibility';
import { GET } from '@/app/api/recruiter/student/[studentId]/route';
import { adminClient, jsonRequest, newUserId, ORG_A, recruiterSessionClient, STUDENT_1 } from './helpers/fixture';
import type { QueryState } from '../privacy/helpers/mockSupabase';

vi.mock('@/lib/supabaseServer', () => ({
  createSupabaseServerClient: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
}));

const FORBIDDEN_CERT_KEYS = ['file_url', 'certificate_url', 'description', 'confidence_score', 'verification_method', 'qr_code_data'];

const profileRow = {
  id: STUDENT_1,
  full_name: 'Asha Rao',
  email: 'asha@uni.edu',
  phone: '+91 99999 00000',
  linkedin: 'https://linkedin.com/in/asha',
  github: 'javascript:alert(1)',
  portfolio: 'https://asha.dev',
  university: 'Uni',
  graduation_year: 2026,
  major: 'CS',
  gpa: 9.1,
  location: 'Pune',
  organization_id: ORG_A,
  created_at: '2025-01-01T00:00:00Z',
};

// Rows the DB might hand back; only safe columns may reach the response.
const certRows = [
  {
    id: 'c1', title: 'Python Basics', institution: 'Uni', date_issued: '2025-05-01',
    verification_status: 'verified', file_url: 'https://bucket/c1.pdf', description: 'RAW OCR TEXT',
    confidence_score: 0.93, verification_method: 'AI + Manual',
  },
];

function setup(opts: { shareContact?: boolean; isApprovedStudent?: boolean; platformStatus?: 'approved' | 'pending' | null } = {}) {
  const userId = newUserId();
  const session = recruiterSessionClient({ userId, platformStatus: opts.platformStatus });
  const admin = adminClient({
    user_roles: () => ({ data: opts.isApprovedStudent === false ? [] : [{ user_id: STUDENT_1, organization_id: ORG_A }] }),
    profiles: (s: QueryState) => {
      if (String(s.find('select')?.args[0]).includes('recruiter_share_contact')) {
        return { data: [{ id: STUDENT_1, public_portfolio_enabled: false, recruiter_share_contact: opts.shareContact === true }] };
      }
      return { data: [profileRow] };
    },
    certificates: () => ({ data: certRows }),
    organizations: () => ({ data: [{ name: 'Uni' }] }),
    audit_logs: () => ({ data: null }),
  });
  vi.mocked(createSupabaseServerClient).mockResolvedValue(session as never);
  vi.mocked(createSupabaseAdminClient).mockResolvedValue(admin as never);
  return { admin, session, userId };
}

const call = (studentId: string) =>
  GET(jsonRequest(`http://localhost/api/recruiter/student/${studentId}`, 'GET'), { params: Promise.resolve({ studentId }) });

describe('GET /api/recruiter/student/[studentId]', () => {
  beforeEach(() => {
    resetVisibilityWarningForTests();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('never returns file_url / description / confidence / verification_method', async () => {
    setup({ shareContact: true });
    const res = await call(STUDENT_1);
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.certifications).toHaveLength(1);
    expect(Object.keys(data.certifications[0]).sort()).toEqual(['date_issued', 'id', 'institution', 'title', 'verification_status']);
    const serialized = JSON.stringify(data);
    for (const key of FORBIDDEN_CERT_KEYS) expect(serialized).not.toContain(key);
    expect(serialized).not.toContain('RAW OCR TEXT');
    expect(serialized).not.toContain('bucket/c1.pdf');
  });

  it('only asks the database for verified certificates inside the recruiter org', async () => {
    const { admin } = setup();
    await call(STUDENT_1);
    const certQuery = admin.callsFor('certificates')[0];
    expect(certQuery.eq('verification_status')).toBe('verified');
    expect(certQuery.eq('student_id')).toBe(STUDENT_1);
    expect(certQuery.find('in', 'organization_id')?.args[1]).toEqual([ORG_A]);
  });

  it('hides contact details and GPA unless the student opted in (secure default)', async () => {
    setup({ shareContact: false });
    const { data } = await (await call(STUDENT_1)).json();
    for (const key of ['email', 'phone', 'linkedin', 'github', 'portfolio', 'gpa']) expect(data).not.toHaveProperty(key);
    expect(data.contact_shared).toBe(false);
    expect(data.name).toBe('Asha Rao');
  });

  it('shows contact details and GPA when shared, but still drops non-http(s) links', async () => {
    setup({ shareContact: true });
    const { data } = await (await call(STUDENT_1)).json();
    expect(data.email).toBe('asha@uni.edu');
    expect(data.phone).toBe('+91 99999 00000');
    expect(data.gpa).toBe(9.1);
    expect(data.linkedin).toBe('https://linkedin.com/in/asha');
    expect(data).not.toHaveProperty('github'); // javascript: URL rejected
  });

  it('returns 404 for ids that are not approved students of the recruiter org', async () => {
    setup({ isApprovedStudent: false });
    const res = await call(STUDENT_1);
    expect(res.status).toBe(404);
    expect(JSON.stringify(await res.json())).not.toContain('Asha');
  });

  it('rejects malformed ids with 400', async () => {
    setup();
    expect((await call('not-a-uuid')).status).toBe(400);
  });

  it('refuses recruiters whose platform row is not approved', async () => {
    setup({ platformStatus: 'pending' });
    expect((await call(STUDENT_1)).status).toBe(403);
  });

  it('requires authentication', async () => {
    const session = recruiterSessionClient({ userId: newUserId() });
    session.auth.getUser = async () => ({ data: { user: null }, error: { message: 'no session' } });
    vi.mocked(createSupabaseServerClient).mockResolvedValue(session as never);
    expect((await call(STUDENT_1)).status).toBe(401);
  });

  it('writes one audit row for the PII read', async () => {
    const { admin, userId } = setup({ shareContact: true });
    await call(STUDENT_1);
    const audits = admin.callsFor('audit_logs');
    expect(audits).toHaveLength(1);
    expect(audits[0].action).toBe('insert');
    expect(audits[0].payload).toMatchObject({
      user_id: userId,
      organization_id: ORG_A,
      action: 'recruiter_view_student',
      target_id: STUDENT_1,
    });
  });

  it('does not leak internal error text', async () => {
    const { admin } = setup();
    vi.mocked(createSupabaseAdminClient).mockResolvedValue(
      adminClient({
        ...Object.fromEntries(['user_roles', 'profiles', 'certificates'].map((t) => [t, () => ({ data: null, error: { message: 'relation "secret_table" exploded' } })])),
      }) as never
    );
    void admin;
    const res = await call(STUDENT_1);
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain('secret_table');
  });
});
