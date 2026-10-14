// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { ADMIN, DOC, FACULTY, ORG, OTHER_ORG, STUDENT, docRow, makeDb, roleRow } from './fixtures';
import type { MemDb } from './memdb';

const h = vi.hoisted(() => ({ db: null as unknown as MemDb }));

vi.mock('@/lib/supabaseServer', () => ({
  createSupabaseServerClient: async () => h.db.client(),
  createSupabaseAdminClient: async () => h.db.client(),
  requireRole: async () => ({ authorized: false, message: 'unused' }),
  getServerUserWithRole: async () => null,
}));

import { POST as verifyPOST } from '@/app/api/documents/verify/route';
import { POST as revokePOST, GET as revokeGET } from '@/app/api/documents/revoke/route';

function post(body: unknown) {
  return new NextRequest('http://localhost/api/documents/verify', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const verifyBody = (extra: Record<string, unknown> = {}) => ({
  documentId: DOC,
  verificationStatus: 'verified',
  ...extra,
});

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('POST /api/documents/verify - approval-aware reviewer gate', () => {
  it('rejects a pending faculty row with 403 and writes nothing', async () => {
    h.db = makeDb(FACULTY, [roleRow(FACULTY, 'faculty', 'pending')]);
    const res = await verifyPOST(post(verifyBody()));
    expect(res.status).toBe(403);
    expect(h.db.rows('documents')[0].verification_status).toBe('pending');
    expect(h.db.ops('documents', 'update')).toHaveLength(0);
    expect(h.db.rows('audit_logs')).toHaveLength(0);
  });

  it('rejects a denied faculty row with 403', async () => {
    h.db = makeDb(FACULTY, [roleRow(FACULTY, 'faculty', 'denied')]);
    expect((await verifyPOST(post(verifyBody()))).status).toBe(403);
  });

  it('rejects an approved faculty of ANOTHER organization with 403', async () => {
    h.db = makeDb(FACULTY, [roleRow(FACULTY, 'faculty', 'approved', OTHER_ORG)]);
    const res = await verifyPOST(post(verifyBody()));
    expect(res.status).toBe(403);
    expect(h.db.rows('documents')[0].verification_status).toBe('pending');
  });

  it('rejects a student (even approved) with 403', async () => {
    h.db = makeDb(STUDENT, [roleRow(STUDENT, 'student', 'approved')]);
    expect((await verifyPOST(post(verifyBody()))).status).toBe(403);
  });

  it('returns 401 without a session', async () => {
    h.db = makeDb(null, []);
    expect((await verifyPOST(post(verifyBody()))).status).toBe(401);
  });

  it('allows an approved faculty of the same org and writes exactly one audit row', async () => {
    h.db = makeDb(FACULTY, [roleRow(FACULTY, 'faculty', 'approved')]);
    const res = await verifyPOST(post(verifyBody({ confidence: 85, reason: 'looks genuine' })));
    expect(res.status).toBe(200);
    expect(h.db.rows('documents')[0].verification_status).toBe('verified');

    const audits = h.db.rows('audit_logs');
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      actor_id: FACULTY,
      organization_id: ORG,
      action: 'verify_document',
      target_id: DOC,
    });
    expect(audits[0].details).toMatchObject({ from_status: 'pending', to_status: 'verified' });
  });

  it('normalises confidence 0..100 to 0..1 and keeps 0..1 values', async () => {
    h.db = makeDb(FACULTY, [roleRow(FACULTY, 'faculty', 'approved')]);
    await verifyPOST(post(verifyBody({ confidence: 85 })));
    expect(h.db.rows('document_metadata')[0].ai_confidence_score).toBe(0.85);

    h.db = makeDb(FACULTY, [roleRow(FACULTY, 'faculty', 'approved')]);
    await verifyPOST(post(verifyBody({ confidence: 0.6 })));
    expect(h.db.rows('document_metadata')[0].ai_confidence_score).toBe(0.6);
  });

  it.each([101, -1, '90'])('rejects invalid confidence %s with 400', async (confidence) => {
    h.db = makeDb(FACULTY, [roleRow(FACULTY, 'faculty', 'approved')]);
    const res = await verifyPOST(post(verifyBody({ confidence })));
    expect(res.status).toBe(400);
    expect(h.db.ops('documents', 'update')).toHaveLength(0);
  });

  it('upserts metadata with onConflict and MERGES existing evidence', async () => {
    h.db = makeDb(FACULTY, [roleRow(FACULTY, 'faculty', 'approved')]);
    h.db.seed('document_metadata', [
      { document_id: DOC, verification_details: { qr: { ok: true }, mrz: 'ABC' }, ai_confidence_score: 0.4 },
    ]);
    const res = await verifyPOST(post(verifyBody({ reason: 'ok' })));
    expect(res.status).toBe(200);

    const upserts = h.db.ops('document_metadata', 'upsert');
    expect(upserts).toHaveLength(1);
    expect(upserts[0].onConflict).toBe('document_id');

    const meta = h.db.rows('document_metadata');
    expect(meta).toHaveLength(1);
    const details = meta[0].verification_details as Record<string, unknown>;
    expect(details.qr).toEqual({ ok: true });
    expect(details.mrz).toBe('ABC');
    expect(details.review).toMatchObject({ status: 'verified', reviewed_by: FACULTY });
    // confidence not supplied -> existing score untouched
    expect(meta[0].ai_confidence_score).toBe(0.4);
  });

  it('requires a reason to reject and records rejected status with its own audit action', async () => {
    h.db = makeDb(FACULTY, [roleRow(FACULTY, 'faculty', 'approved')]);
    expect((await verifyPOST(post(verifyBody({ verificationStatus: 'rejected' })))).status).toBe(400);

    const res = await verifyPOST(post(verifyBody({ verificationStatus: 'rejected', reason: 'blurry' })));
    expect(res.status).toBe(200);
    expect(h.db.rows('documents')[0].verification_status).toBe('rejected');
    expect(h.db.rows('audit_logs')).toHaveLength(1);
    expect(h.db.rows('audit_logs')[0].action).toBe('reject_document');
  });

  it('does not accept "revoked" through verify', async () => {
    h.db = makeDb(FACULTY, [roleRow(FACULTY, 'faculty', 'approved')], [docRow({ verification_status: 'verified' })]);
    expect((await verifyPOST(post(verifyBody({ verificationStatus: 'revoked', reason: 'x' })))).status).toBe(400);
  });

  it('refuses to let a reviewer verify their own document', async () => {
    h.db = makeDb(FACULTY, [roleRow(FACULTY, 'faculty', 'approved')], [docRow({ student_id: FACULTY, user_id: FACULTY })]);
    expect((await verifyPOST(post(verifyBody()))).status).toBe(403);
  });

  it('returns 409 for an invalid transition (verified -> rejected)', async () => {
    h.db = makeDb(FACULTY, [roleRow(FACULTY, 'faculty', 'approved')], [docRow({ verification_status: 'verified' })]);
    const res = await verifyPOST(post(verifyBody({ verificationStatus: 'rejected', reason: 'x' })));
    expect(res.status).toBe(409);
    expect(h.db.rows('audit_logs')).toHaveLength(0);
  });

  it('only admins can re-open a revoked document', async () => {
    const revoked = [docRow({ verification_status: 'revoked' })];
    h.db = makeDb(FACULTY, [roleRow(FACULTY, 'faculty', 'approved')], revoked);
    expect((await verifyPOST(post(verifyBody({ verificationStatus: 'pending' })))).status).toBe(409);

    h.db = makeDb(ADMIN, [roleRow(ADMIN, 'admin', 'approved')], [docRow({ verification_status: 'revoked' })]);
    const res = await verifyPOST(post(verifyBody({ verificationStatus: 'pending' })));
    expect(res.status).toBe(200);
    expect(h.db.rows('documents')[0].verification_status).toBe('pending');
  });

  it('conditional update: returns 409 when the status changed concurrently', async () => {
    h.db = makeDb(FACULTY, [roleRow(FACULTY, 'faculty', 'approved')]);
    // another reviewer rejects the document between our read and our write
    h.db.beforeUpdate = (table) => {
      if (table === 'documents') h.db.rows('documents')[0].verification_status = 'rejected';
    };
    const res = await verifyPOST(post(verifyBody()));
    expect(res.status).toBe(409);
    expect(h.db.rows('documents')[0].verification_status).toBe('rejected');
    expect(h.db.rows('audit_logs')).toHaveLength(0);
    expect(h.db.rows('document_metadata')).toHaveLength(0);
  });

  it('treats a database failure as not found, never as success', async () => {
    h.db = makeDb(FACULTY, [roleRow(FACULTY, 'faculty', 'approved')]);
    h.db.failTables.add('documents');
    const res = await verifyPOST(post(verifyBody()));
    expect(res.status).toBe(404);
  });

  it('returns a response (not a thrown Response) for malformed JSON and bad ids', async () => {
    h.db = makeDb(FACULTY, [roleRow(FACULTY, 'faculty', 'approved')]);
    const bad = new NextRequest('http://localhost/api/documents/verify', { method: 'POST', body: '{nope' });
    expect((await verifyPOST(bad)).status).toBe(400);
    expect((await verifyPOST(post({ documentId: 'not-a-uuid', verificationStatus: 'verified' }))).status).toBe(400);
  });
});

describe('/api/documents/revoke', () => {
  const revokeReq = (body: unknown) =>
    new NextRequest('http://localhost/api/documents/revoke', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

  it('pending faculty cannot revoke (403)', async () => {
    h.db = makeDb(FACULTY, [roleRow(FACULTY, 'faculty', 'pending')], [docRow({ verification_status: 'verified' })]);
    expect((await revokePOST(revokeReq({ documentId: DOC, reason: 'fraud' }))).status).toBe(403);
    expect(h.db.rows('documents')[0].verification_status).toBe('verified');
  });

  it('approved same-org faculty can revoke a verified document, preserving evidence, with one audit row', async () => {
    h.db = makeDb(FACULTY, [roleRow(FACULTY, 'faculty', 'approved')], [docRow({ verification_status: 'verified' })]);
    h.db.seed('document_metadata', [{ document_id: DOC, verification_details: { qr: 'kept' } }]);
    const res = await revokePOST(revokeReq({ documentId: DOC, reason: 'fraud' }));
    expect(res.status).toBe(200);
    expect(h.db.rows('documents')[0].verification_status).toBe('revoked');
    const details = h.db.rows('document_metadata')[0].verification_details as Record<string, unknown>;
    expect(details).toMatchObject({ qr: 'kept', revoked: true, reason: 'fraud', revoked_by: FACULTY });
    expect(h.db.rows('audit_logs')).toHaveLength(1);
  });

  it('cannot revoke a pending document (409)', async () => {
    h.db = makeDb(FACULTY, [roleRow(FACULTY, 'faculty', 'approved')]);
    expect((await revokePOST(revokeReq({ documentId: DOC, reason: 'x' }))).status).toBe(409);
  });

  it('GET is restricted to the owner or approved reviewers', async () => {
    const getReq = new NextRequest(`http://localhost/api/documents/revoke?documentId=${DOC}`);
    const revokedDoc = () => [docRow({ verification_status: 'revoked' })];

    h.db = makeDb(STUDENT, [roleRow(STUDENT, 'student', 'approved')], revokedDoc());
    expect((await revokeGET(getReq)).status).toBe(200);

    const stranger = '88888888-8888-4888-8888-888888888888';
    h.db = makeDb(stranger, [roleRow(stranger, 'recruiter', 'approved', null)], revokedDoc());
    expect((await revokeGET(getReq)).status).toBe(403);

    h.db = makeDb(FACULTY, [roleRow(FACULTY, 'faculty', 'pending')], revokedDoc());
    expect((await revokeGET(getReq)).status).toBe(403);
  });
});
