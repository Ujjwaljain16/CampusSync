// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { FACULTY, ORG, RECRUITER, STUDENT, docRow, makeDb, roleRow } from './fixtures';
import type { MemDb } from './memdb';

const h = vi.hoisted(() => ({ db: null as unknown as MemDb }));

vi.mock('@/lib/supabaseServer', () => ({
  createSupabaseServerClient: async () => h.db.client(),
  createSupabaseAdminClient: async () => h.db.client(),
  requireRole: async () => ({ authorized: false, message: 'unused' }),
  getServerUserWithRole: async () => null,
}));

import { GET, POST } from '@/app/api/documents/route';

const SUPABASE = 'https://proj.supabase.co';
const goodUrl = (user = STUDENT, name = 'file.pdf') => `${SUPABASE}/storage/v1/object/public/certificates/${user}/${name}`;

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE;
});

const list = (qs = '') => new NextRequest(`http://localhost/api/documents${qs}`);

describe('GET /api/documents', () => {
  const OTHER_STUDENT = '99999999-9999-4999-8999-999999999999';

  it('students see only their own rows', async () => {
    h.db = makeDb(
      STUDENT,
      [roleRow(STUDENT, 'student', 'approved')],
      [docRow(), docRow({ id: 'a', student_id: OTHER_STUDENT, user_id: OTHER_STUDENT })]
    );
    const res = await GET(list());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].student_id).toBe(STUDENT);
  });

  it('a student cannot widen the result with ?student_id=', async () => {
    h.db = makeDb(
      STUDENT,
      [roleRow(STUDENT, 'student', 'approved')],
      [docRow(), docRow({ id: 'a', student_id: OTHER_STUDENT, user_id: OTHER_STUDENT })]
    );
    const body = await (await GET(list(`?student_id=${OTHER_STUDENT}`))).json();
    expect(body.data.every((d: { student_id: string }) => d.student_id === STUDENT)).toBe(true);
  });

  it('approved reviewers see the organization rows', async () => {
    h.db = makeDb(
      FACULTY,
      [roleRow(FACULTY, 'faculty', 'approved')],
      [docRow(), docRow({ id: 'a', student_id: OTHER_STUDENT, user_id: OTHER_STUDENT })]
    );
    const body = await (await GET(list())).json();
    expect(body.data).toHaveLength(2);
  });

  it('pending faculty get 403, not the org rows', async () => {
    h.db = makeDb(FACULTY, [roleRow(FACULTY, 'faculty', 'pending')]);
    expect((await GET(list())).status).toBe(403);
  });

  it('recruiters get 403', async () => {
    h.db = makeDb(RECRUITER, [roleRow(RECRUITER, 'recruiter', 'approved', ORG)]);
    expect((await GET(list())).status).toBe(403);
  });

  it('?scope=mine gives a reviewer only their own rows', async () => {
    h.db = makeDb(FACULTY, [roleRow(FACULTY, 'faculty', 'approved')]);
    const body = await (await GET(list('?scope=mine'))).json();
    expect(body.data).toHaveLength(0);
  });

  it('clamps limit to 100, defaults to 50, and uses range()', async () => {
    h.db = makeDb(FACULTY, [roleRow(FACULTY, 'faculty', 'approved')]);
    await GET(list('?limit=100000&offset=5'));
    await GET(list());
    await GET(list('?limit=-3'));
    const docOps = h.db.ops('documents', 'select').filter((o) => o.range);
    expect(docOps.map((o) => o.range)).toEqual([
      [5, 104],
      [0, 49],
      [0, 0],
    ]);
  });

  it('selects explicit columns without ocr_text or *', async () => {
    h.db = makeDb(STUDENT, [roleRow(STUDENT, 'student', 'approved')]);
    await GET(list());
    const cols = h.db.ops('documents', 'select').find((o) => o.range)!.columns!;
    expect(cols).not.toContain('ocr_text');
    expect(cols.trim()).not.toBe('*');
  });

  it('validates filters', async () => {
    h.db = makeDb(FACULTY, [roleRow(FACULTY, 'faculty', 'approved')]);
    expect((await GET(list('?status=bogus'))).status).toBe(400);
    expect((await GET(list('?student_id=nope'))).status).toBe(400);
  });
});

describe('POST /api/documents', () => {
  const post = (body: unknown) =>
    new NextRequest('http://localhost/api/documents', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  const base = (extra: Record<string, unknown> = {}) => ({
    document_type: 'certificate',
    title: 'My cert',
    file_url: goodUrl(),
    ...extra,
  });

  it('creates a pending document for a valid own-storage file_url and audits once', async () => {
    h.db = makeDb(STUDENT, [roleRow(STUDENT, 'student', 'approved')], []);
    const res = await POST(post(base({ verification_status: 'verified', ocr_confidence: 87 })));
    expect(res.status).toBe(201);
    const row = h.db.rows('documents')[0];
    expect(row).toMatchObject({ verification_status: 'pending', student_id: STUDENT, organization_id: ORG, ocr_confidence: 0.87 });
    expect(h.db.rows('audit_logs')).toHaveLength(1);
  });

  it.each([
    ['foreign host', 'https://evil.test/storage/v1/object/public/certificates/' + STUDENT + '/a.pdf'],
    ['suffix host', 'https://proj.supabase.co.evil.test/storage/v1/object/public/certificates/' + STUDENT + '/a.pdf'],
    ['userinfo trick', 'https://proj.supabase.co@evil.test/storage/v1/object/public/certificates/' + STUDENT + '/a.pdf'],
    ['other user folder', goodUrl('99999999-9999-4999-8999-999999999999')],
    ['dot-dot traversal', `${SUPABASE}/storage/v1/object/public/certificates/${STUDENT}/../other/a.pdf`],
    ['includes-only trick', `${SUPABASE}/storage/v1/object/public/other-bucket/x/${STUDENT}/a.pdf`],
    ['not a url', 'javascript:alert(1)'],
  ])('rejects file_url: %s', async (_name, file_url) => {
    h.db = makeDb(STUDENT, [roleRow(STUDENT, 'student', 'approved')], []);
    expect((await POST(post(base({ file_url })))).status).toBe(400);
    expect(h.db.rows('documents')).toHaveLength(0);
  });

  it('clamps ocr_text and validates ocr/metadata fields', async () => {
    h.db = makeDb(STUDENT, [roleRow(STUDENT, 'student', 'approved')], []);
    const res = await POST(post(base({ ocr_text: 'x'.repeat(80_000) })));
    expect(res.status).toBe(201);
    expect((h.db.rows('documents')[0].ocr_text as string).length).toBe(50_000);

    expect((await POST(post(base({ ocr_confidence: 'high' })))).status).toBe(400);
    expect((await POST(post(base({ ocr_confidence: 900 })))).status).toBe(400);
    expect((await POST(post(base({ metadata: 'str' })))).status).toBe(400);
    expect((await POST(post(base({ metadata: { big: 'y'.repeat(30_000) } })))).status).toBe(400);
  });

  it('requires the mandatory fields', async () => {
    h.db = makeDb(STUDENT, [roleRow(STUDENT, 'student', 'approved')], []);
    expect((await POST(post({ title: 'x' }))).status).toBe(400);
  });
});
