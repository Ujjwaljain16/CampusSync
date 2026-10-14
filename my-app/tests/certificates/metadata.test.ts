// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { createFakeDb, uuid, type FakeDb, type Row } from './fakeSupabase';

const h = vi.hoisted(() => ({ db: null as any }));

vi.mock('@/lib/supabaseServer', () => ({
  createSupabaseServerClient: async () => h.db.client,
  createSupabaseAdminClient: async () => h.db.adminClient,
}));

import { GET } from '@/app/api/certificates/metadata/[certificateId]/route';

const ORG = uuid(100);
const OTHER_ORG = uuid(101);
const STUDENT = uuid(2);
const FACULTY = uuid(1);
const CERT = uuid(10);

const cert = (over: Row = {}): Row => ({
  id: CERT,
  student_id: STUDENT,
  organization_id: ORG,
  confidence_score: 0.91,
  verification_details: { matched: ['title', 'institution'] },
  auto_approved: false,
  verification_method: 'manual',
  created_at: '2025-02-03T00:00:00.000Z',
  ...over,
});

let db: FakeDb;
const setup = (userId: string, roles: Row[], certs: Row[] = [cert()]) => {
  db = createFakeDb({
    certificates: certs,
    user_roles: roles,
    // must never be read: the table is gone
    certificate_metadata: [{ certificate_id: CERT, ai_confidence_score: 0.1, verification_method: 'stale-table-row' }],
  });
  db.user = { id: userId };
  h.db = db;
};

const call = (id = CERT) =>
  GET(new NextRequest(`http://localhost/api/certificates/metadata/${id}`), { params: Promise.resolve({ certificateId: id }) });

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('GET /api/certificates/metadata/[certificateId]', () => {
  it('serves the certificate row only, never certificate_metadata', async () => {
    setup(STUDENT, []);
    const res = await call();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toEqual({
      data: {
        certificate_id: CERT,
        ai_confidence_score: 0.91,
        verification_details: { matched: ['title', 'institution'] },
        auto_approved: false,
        verification_method: 'manual',
        created_at: '2025-02-03T00:00:00.000Z',
      },
    });
    expect(JSON.stringify(json)).not.toContain('stale-table-row');
    expect(db.log.filter(l => l.endsWith(':certificate_metadata'))).toEqual([]);
    expect(db.log.filter(l => l.endsWith(':certificates'))).toEqual(['select:certificates']);
  });

  it('defaults missing values (no details, no method) without a second query', async () => {
    setup(STUDENT, [], [cert({ verification_details: null, confidence_score: null, auto_approved: null, verification_method: null })]);
    const json = await (await call()).json();
    expect(json.data.data).toMatchObject({
      ai_confidence_score: null,
      verification_details: {},
      auto_approved: false,
      verification_method: null,
    });
    expect(db.log).toEqual(['select:certificates']);
  });

  it('lets an approved reviewer of the certificate organization read it', async () => {
    setup(FACULTY, [{ user_id: FACULTY, role: 'faculty', organization_id: ORG, approval_status: 'approved' }]);
    expect((await call()).status).toBe(200);
  });

  it('answers 404 (not 403) for a reviewer of another organization and for a stranger', async () => {
    setup(FACULTY, [{ user_id: FACULTY, role: 'faculty', organization_id: OTHER_ORG, approval_status: 'approved' }]);
    expect((await call()).status).toBe(404);
    setup(uuid(99), []);
    expect((await call()).status).toBe(404);
  });

  it('404s an unknown certificate and 400s a malformed id', async () => {
    setup(STUDENT, []);
    expect((await call(uuid(404))).status).toBe(404);
    expect((await call('nope')).status).toBe(400);
  });
});
