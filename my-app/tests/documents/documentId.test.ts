// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { ADMIN, DOC, FACULTY, ORG, RECRUITER, STUDENT, docRow, makeDb, roleRow } from './fixtures';
import type { MemDb } from './memdb';

const h = vi.hoisted(() => ({ db: null as unknown as MemDb }));

vi.mock('@/lib/supabaseServer', () => ({
  createSupabaseServerClient: async () => h.db.client(),
  createSupabaseAdminClient: async () => h.db.client(),
  requireRole: async () => ({ authorized: false, message: 'unused' }),
  getServerUserWithRole: async () => null,
}));

import { GET, PATCH } from '@/app/api/documents/[id]/route';
import { POST as metadataPOST, GET as metadataGET } from '@/app/api/documents/[id]/metadata/route';

const ctx = { params: Promise.resolve({ id: DOC }) };
const patch = (body: unknown) =>
  new NextRequest(`http://localhost/api/documents/${DOC}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('PATCH /api/documents/[id] - owner edits', () => {
  const studentRoles = () => [roleRow(STUDENT, 'student', 'approved')];

  it('lets the owner edit a pending document and writes one audit row', async () => {
    h.db = makeDb(STUDENT, studentRoles());
    const res = await PATCH(patch({ title: 'New title' }), ctx);
    expect(res.status).toBe(200);
    expect(h.db.rows('documents')[0]).toMatchObject({ title: 'New title', verification_status: 'pending' });
    expect(h.db.rows('audit_logs')).toHaveLength(1);
    expect(h.db.rows('audit_logs')[0]).toMatchObject({ action: 'edit_document', target_id: DOC, actor_id: STUDENT });
  });

  it.each(['verified', 'revoked'])('makes a %s document immutable for its owner (409)', async (status) => {
    h.db = makeDb(STUDENT, studentRoles(), [docRow({ verification_status: status })]);
    const res = await PATCH(patch({ title: 'Tampered' }), ctx);
    expect(res.status).toBe(409);
    expect(h.db.rows('documents')[0].title).toBe('Degree');
    expect(h.db.rows('documents')[0].verification_status).toBe(status);
    expect(h.db.rows('audit_logs')).toHaveLength(0);
  });

  it('resets a rejected document to pending when the owner edits it', async () => {
    h.db = makeDb(STUDENT, studentRoles(), [docRow({ verification_status: 'rejected' })]);
    const res = await PATCH(patch({ institution: 'Fixed Uni' }), ctx);
    expect(res.status).toBe(200);
    expect(h.db.rows('documents')[0]).toMatchObject({ institution: 'Fixed Uni', verification_status: 'pending' });
    expect(h.db.rows('audit_logs')[0].details).toMatchObject({ from_status: 'rejected', to_status: 'pending' });
  });

  it('does not let the owner change verification_status', async () => {
    h.db = makeDb(STUDENT, studentRoles());
    expect((await PATCH(patch({ verification_status: 'verified' }), ctx)).status).toBe(403);
    expect(h.db.rows('documents')[0].verification_status).toBe('pending');
  });

  it('rejects mixing content and status changes', async () => {
    h.db = makeDb(FACULTY, [roleRow(FACULTY, 'faculty', 'approved')]);
    expect((await PATCH(patch({ title: 'x', verification_status: 'verified' }), ctx)).status).toBe(400);
  });

  it('returns 409 when the status changes between read and write', async () => {
    h.db = makeDb(STUDENT, studentRoles());
    h.db.beforeUpdate = () => {
      h.db.rows('documents')[0].verification_status = 'verified';
    };
    expect((await PATCH(patch({ title: 'Race' }), ctx)).status).toBe(409);
    expect(h.db.rows('documents')[0].title).toBe('Degree');
  });

  it('validates field types', async () => {
    h.db = makeDb(STUDENT, studentRoles());
    expect((await PATCH(patch({ title: 123 }), ctx)).status).toBe(400);
    expect((await PATCH(patch({ issue_date: 'yesterday' }), ctx)).status).toBe(400);
    expect((await PATCH(patch({ metadata: [1] }), ctx)).status).toBe(400);
    expect((await PATCH(patch({}), ctx)).status).toBe(400);
  });
});

describe('PATCH /api/documents/[id] - non-owners', () => {
  it('forbids a recruiter from editing any org document', async () => {
    h.db = makeDb(RECRUITER, [roleRow(RECRUITER, 'recruiter', 'approved', null)]);
    expect((await PATCH(patch({ title: 'x' }), ctx)).status).toBe(403);
    expect((await PATCH(patch({ verification_status: 'verified' }), ctx)).status).toBe(403);
    expect(h.db.ops('documents', 'update')).toHaveLength(0);
  });

  it('forbids a pending faculty from changing status', async () => {
    h.db = makeDb(FACULTY, [roleRow(FACULTY, 'faculty', 'pending')]);
    expect((await PATCH(patch({ verification_status: 'verified' }), ctx)).status).toBe(403);
  });

  it('forbids an approved reviewer from editing content of someone else\'s document', async () => {
    h.db = makeDb(FACULTY, [roleRow(FACULTY, 'faculty', 'approved')]);
    expect((await PATCH(patch({ title: 'x' }), ctx)).status).toBe(403);
  });

  it('lets an approved reviewer move pending -> rejected (with reason) and audits once', async () => {
    h.db = makeDb(FACULTY, [roleRow(FACULTY, 'faculty', 'approved')]);
    expect((await PATCH(patch({ verification_status: 'rejected' }), ctx)).status).toBe(400); // reason required
    const res = await PATCH(patch({ verification_status: 'rejected', reason: 'unreadable' }), ctx);
    expect(res.status).toBe(200);
    expect(h.db.rows('documents')[0].verification_status).toBe('rejected');
    expect(h.db.rows('audit_logs')).toHaveLength(1);
    expect(h.db.rows('audit_logs')[0].action).toBe('reject_document');
  });

  it('rejects disallowed transitions with 409 and revoked->pending for non-admins', async () => {
    h.db = makeDb(FACULTY, [roleRow(FACULTY, 'faculty', 'approved')], [docRow({ verification_status: 'rejected' })]);
    expect((await PATCH(patch({ verification_status: 'verified' }), ctx)).status).toBe(409);

    h.db = makeDb(FACULTY, [roleRow(FACULTY, 'faculty', 'approved')], [docRow({ verification_status: 'revoked' })]);
    expect((await PATCH(patch({ verification_status: 'pending' }), ctx)).status).toBe(409);

    h.db = makeDb(ADMIN, [roleRow(ADMIN, 'admin', 'approved')], [docRow({ verification_status: 'revoked' })]);
    expect((await PATCH(patch({ verification_status: 'pending' }), ctx)).status).toBe(200);
  });
});

describe('GET /api/documents/[id]', () => {
  const req = new NextRequest(`http://localhost/api/documents/${DOC}`);

  it('allows the owner and approved same-org reviewers', async () => {
    h.db = makeDb(STUDENT, [roleRow(STUDENT, 'student', 'approved')]);
    expect((await GET(req, ctx)).status).toBe(200);
    h.db = makeDb(FACULTY, [roleRow(FACULTY, 'faculty', 'approved')]);
    expect((await GET(req, ctx)).status).toBe(200);
  });

  it('denies pending faculty, recruiters and other students', async () => {
    h.db = makeDb(FACULTY, [roleRow(FACULTY, 'faculty', 'pending')]);
    expect((await GET(req, ctx)).status).toBe(403);
    h.db = makeDb(RECRUITER, [roleRow(RECRUITER, 'recruiter', 'approved', null)]);
    expect((await GET(req, ctx)).status).toBe(403);
    h.db = makeDb(ADMIN, [roleRow(ADMIN, 'student', 'approved')]);
    expect((await GET(req, ctx)).status).toBe(403);
  });

  it('rejects malformed ids', async () => {
    h.db = makeDb(STUDENT, [roleRow(STUDENT, 'student', 'approved')]);
    expect((await GET(req, { params: Promise.resolve({ id: '../etc' }) })).status).toBe(400);
  });
});

describe('/api/documents/[id]/metadata', () => {
  const post = (body: unknown) =>
    new NextRequest(`http://localhost/api/documents/${DOC}/metadata`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

  it('POST: pending faculty gets 403 and nothing is written', async () => {
    h.db = makeDb(FACULTY, [roleRow(FACULTY, 'faculty', 'pending')]);
    expect((await metadataPOST(post({ ai_confidence_score: 0.9 }), ctx)).status).toBe(403);
    expect(h.db.rows('document_metadata')).toHaveLength(0);
  });

  it('POST: students cannot self-report scores', async () => {
    h.db = makeDb(STUDENT, [roleRow(STUDENT, 'student', 'approved')]);
    expect((await metadataPOST(post({ ai_confidence_score: 1 }), ctx)).status).toBe(403);
  });

  it('POST: approved reviewer merges evidence, normalises confidence, audits once', async () => {
    h.db = makeDb(FACULTY, [roleRow(FACULTY, 'faculty', 'approved')]);
    h.db.seed('document_metadata', [{ document_id: DOC, verification_details: { qr: 'kept' } }]);
    const res = await metadataPOST(post({ ai_confidence_score: 72, verification_details: { note: 'checked' } }), ctx);
    expect(res.status).toBe(200);
    const row = h.db.rows('document_metadata')[0];
    expect(row.ai_confidence_score).toBe(0.72);
    expect(row.verification_details).toEqual({ qr: 'kept', note: 'checked' });
    expect(h.db.ops('document_metadata', 'upsert')[0].onConflict).toBe('document_id');
    expect(h.db.rows('audit_logs')).toHaveLength(1);
    expect(h.db.rows('audit_logs')[0]).toMatchObject({ action: 'update_document_metadata', organization_id: ORG });
  });

  it('POST: rejects out-of-range confidence and empty payloads', async () => {
    h.db = makeDb(FACULTY, [roleRow(FACULTY, 'faculty', 'approved')]);
    expect((await metadataPOST(post({ ai_confidence_score: 500 }), ctx)).status).toBe(400);
    expect((await metadataPOST(post({}), ctx)).status).toBe(400);
  });

  it('GET: owner and approved reviewers only', async () => {
    const get = new NextRequest(`http://localhost/api/documents/${DOC}/metadata`);
    h.db = makeDb(STUDENT, [roleRow(STUDENT, 'student', 'approved')]);
    expect((await metadataGET(get, ctx)).status).toBe(200);
    h.db = makeDb(FACULTY, [roleRow(FACULTY, 'faculty', 'pending')]);
    expect((await metadataGET(get, ctx)).status).toBe(403);
  });
});
