// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabaseServer';
import { resetVisibilityWarningForTests } from '@/lib/privacy/visibility';
import { GET } from '@/app/api/public/portfolio/[userId]/route';
import { createMockClient, type QueryResult } from './helpers/mockSupabase';

vi.mock('@/lib/supabaseServer', () => ({
  createSupabaseAdminClient: vi.fn(),
  createSupabaseServerClient: vi.fn(),
}));

const USER = '55555555-5555-4555-8555-555555555555';
const CERT_1 = '66666666-6666-4666-8666-666666666661';
const CERT_2 = '66666666-6666-4666-8666-666666666662';

function setup(opts: { profileResult?: QueryResult; student?: boolean } = {}) {
  const admin = createMockClient({
    profiles: () => opts.profileResult ?? { data: [{ id: USER, public_portfolio_enabled: true, recruiter_share_contact: false }] },
    user_roles: () => ({ data: opts.student === false ? [] : [{ user_id: USER }] }),
    certificates: () => ({
      data: [
        { id: CERT_1, title: 'Python Basics', institution: 'Uni', date_issued: '2025-05-01', description: 'RAW OCR', confidence_score: 0.9, file_url: 'https://b/x.pdf' },
        { id: CERT_2, title: 'Docker', institution: 'Uni', date_issued: null },
      ],
    }),
    verifiable_credentials: () => ({
      data: [
        { id: 'urn:uuid:vc-1', credential: { credentialSubject: { certificateId: CERT_1 }, proof: { jws: 'aaa.bbb.ccc' } } },
        { id: 'urn:uuid:vc-old', credential: { credentialSubject: { certificateId: CERT_1 }, proof: { jws: 'old.old.old' } } },
      ],
    }),
  });
  vi.mocked(createSupabaseAdminClient).mockResolvedValue(admin as never);
  return admin;
}

const call = (id = USER, qs = '') =>
  GET(new NextRequest(`http://localhost/api/public/portfolio/${id}${qs}`), { params: Promise.resolve({ userId: id }) });

describe('GET /api/public/portfolio/[userId]', () => {
  beforeEach(() => {
    resetVisibilityWarningForTests();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('denies by default when the student has not enabled the portfolio', async () => {
    const admin = setup({ profileResult: { data: [{ id: USER, public_portfolio_enabled: false, recruiter_share_contact: false }] } });
    const res = await call();
    expect(res.status).toBe(404);
    expect(admin.callsFor('certificates')).toHaveLength(0); // never even queried
  });

  it('denies when the privacy columns do not exist yet (missing-column fallback)', async () => {
    const admin = setup({ profileResult: { data: null, error: { code: '42703', message: 'column does not exist' } } });
    expect((await call()).status).toBe(404);
    expect(admin.callsFor('certificates')).toHaveLength(0);
  });

  it('uses the same answer for unknown / non-student users (no enumeration)', async () => {
    setup({ student: false });
    const res = await call();
    expect(res.status).toBe(404);
    const body = await res.json();
    setup({ profileResult: { data: [] } });
    expect(await (await call()).json()).toEqual(body);
  });

  it('serves verified certificates in the documented envelope shape', async () => {
    const admin = setup();
    const res = await call();
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const json = await res.json();
    expect(Object.keys(json)).toEqual(['data']);
    expect(Object.keys(json.data)).toEqual(['certificates']);
    expect(json.data.certificates).toEqual([
      { id: CERT_1, title: 'Python Basics', institution: 'Uni', date_issued: '2025-05-01', credential: { id: 'urn:uuid:vc-1', jws: 'aaa.bbb.ccc' } },
      { id: CERT_2, title: 'Docker', institution: 'Uni', date_issued: null },
    ]);
    expect(admin.callsFor('certificates')[0].eq('verification_status')).toBe('verified');
    expect(admin.callsFor('verifiable_credentials')[0].eq('status')).toBe('active');
  });

  it('never exposes description, OCR text, confidence, file urls or user ids', async () => {
    setup();
    const text = JSON.stringify(await (await call()).json());
    for (const forbidden of ['RAW OCR', 'description', 'confidence', 'file_url', 'b/x.pdf', USER, 'user_id']) {
      expect(text).not.toContain(forbidden);
    }
  });

  it('rejects malformed ids', async () => {
    setup();
    expect((await call('not-a-uuid')).status).toBe(400);
    expect((await call(USER, '?organizationId=bad')).status).toBe(400);
  });
});
