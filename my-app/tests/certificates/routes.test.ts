// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { createFakeDb, uuid, type FakeDb, type Row } from './fakeSupabase';

// ---- mocks (plain functions where state must survive `mockReset: true`) ----
const h = vi.hoisted(() => ({
  db: null as any,
  role: 'faculty',
  vcCounter: 0,
  sendApproved: vi.fn(),
  sendRejected: vi.fn(),
  signed: [] as any[],
  audits: [] as Array<{ client: any; entry: any }>,
}));

vi.mock('@/lib/supabaseServer', () => ({
  createSupabaseServerClient: async () => h.db.client,
  // service-role client: same in-memory DB, plus auth.admin
  createSupabaseAdminClient: async () => ({
    ...h.db.adminClient,
    auth: {
      admin: {
        getUserById: async () => ({
          data: { user: { email: 'student@campus.test', user_metadata: { full_name: 'Stu Dent' } } },
          error: null,
        }),
      },
    },
  }),
  requireRole: async (allowed: string[]) => {
    const user = h.db.user;
    if (!user) return { user: {}, role: 'student', authorized: false, message: 'Authentication required' };
    return allowed.includes(h.role)
      ? { user, role: h.role, authorized: true }
      : { user, role: h.role, authorized: false, message: 'Access denied' };
  },
}));

// Record audit writes: the canonical entry shape is asserted here, the column mapping is the writer's job.
vi.mock('@/lib/api/utils/audit', () => ({
  writeAudit: async (client: any, entry: any) => {
    h.audits.push({ client, entry });
    return true;
  },
}));

vi.mock('@/lib/emailService', () => ({
  emailService: {
    sendCertificateApproved: (...a: any[]) => h.sendApproved(...a),
    sendCertificateRejected: (...a: any[]) => h.sendRejected(...a),
  },
}));

vi.mock('@/lib/envValidator', () => ({
  getIssuerDID: () => 'did:web:test.example',
  getBaseUrl: () => 'https://app.test',
}));

vi.mock('@/lib/vc', () => ({
  signCredential: async (p: any) => {
    const vc = {
      '@context': ['https://www.w3.org/2018/credentials/v1'],
      id: `urn:uuid:vc-${++h.vcCounter}`,
      type: ['VerifiableCredential'],
      issuer: p.issuerDid,
      issuanceDate: '2025-01-01T00:00:00.000Z',
      credentialSubject: p.credential.credentialSubject,
      proof: { jws: 'x' },
    };
    h.signed.push({ params: p, vc });
    return vc;
  },
}));

import { POST as approvePOST } from '@/app/api/certificates/approve/route';
import { POST as batchPOST } from '@/app/api/certificates/batch-approve/route';
import { POST as revertPOST } from '@/app/api/certificates/revert-approval/route';
import { POST as issuePOST } from '@/app/api/certificates/issue/route';
import { DELETE as deleteDELETE } from '@/app/api/certificates/delete/route';
import { POST as createPOST } from '@/app/api/certificates/create/route';
import { POST as bulkVerifyPOST } from '@/app/api/recruiter/bulk-verify/route';

// ---- fixtures ----
const ORG = uuid(100);
const OTHER_ORG = uuid(101);
const FACULTY = uuid(1);
const STUDENT = uuid(2);
const CERT = uuid(10);
const CERT2 = uuid(11);
const SUPABASE_URL = 'https://proj.supabase.co';

const req = (method: string, url: string, body?: unknown) =>
  new NextRequest(`http://localhost${url}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const cert = (over: Row = {}): Row => ({
  id: CERT,
  student_id: STUDENT,
  organization_id: ORG,
  verification_status: 'pending',
  faculty_id: null,
  title: 'Cloud 101',
  institution: 'MIT',
  date_issued: '2024-05-01',
  description: 'desc',
  file_url: `${SUPABASE_URL}/storage/v1/object/public/certificates/${STUDENT}/1_cert.pdf`,
  ...over,
});

const vcRow = (id: string, certId: string, status = 'active', created = '2025-01-01T00:00:00.000Z'): Row => ({
  id,
  student_id: STUDENT,
  certificate_id: certId,
  organization_id: ORG,
  status,
  created_at: created,
  credential: { id, credentialSubject: { id: STUDENT, certificateId: certId } },
});

const facultyRole = (org = ORG, extra: Row = {}): Row => ({
  user_id: FACULTY,
  role: 'faculty',
  organization_id: org,
  approval_status: 'approved',
  ...extra,
});

let db: FakeDb;
const setup = (tables: Record<string, Row[]>, user: { id: string } | null, role: string) => {
  db = createFakeDb(tables);
  db.user = user;
  h.db = db;
  h.role = role;
};

const asFaculty = (tables: Record<string, Row[]> = {}) =>
  setup(
    { user_roles: [facultyRole()], certificates: [cert()], verifiable_credentials: [], audit_logs: [], ...tables },
    { id: FACULTY },
    'faculty'
  );

const json = async (res: Response) => ({ status: res.status, body: await res.json() });

beforeEach(() => {
  h.vcCounter = 0;
  h.signed = [];
  h.audits = [];
  h.sendApproved.mockResolvedValue(true);
  h.sendRejected.mockResolvedValue(true);
  process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_URL;
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'debug').mockImplementation(() => {});
});

const certStatus = (id = CERT) => db.tables.certificates.find(c => c.id === id)?.verification_status;
const vcStatuses = () => db.tables.verifiable_credentials.map(v => v.status);
const writesTo = (table: string) => db.writes.filter(w => w.table === table);
const auditEntries = () => h.audits.map(a => a.entry);

// ===========================================================================
describe('POST /api/certificates/approve', () => {
  it('approves a pending certificate: updates status, one email, one audit row', async () => {
    asFaculty();
    const { status, body } = await json(await approvePOST(req('POST', '/x', { certificateId: CERT, status: 'verified' })));
    expect(status).toBe(200);
    expect(body.data).toMatchObject({ certificateId: CERT, status: 'verified' });
    expect(certStatus()).toBe('verified');
    // reviewer recorded; verification_status is the only status column (no legacy `status`)
    expect(db.tables.certificates[0]).toMatchObject({ verification_status: 'verified', faculty_id: FACULTY });
    expect(h.sendApproved).toHaveBeenCalledTimes(1);
    expect(h.sendRejected).not.toHaveBeenCalled();
    expect(auditEntries()).toHaveLength(1);
    expect(auditEntries()[0]).toMatchObject({
      actorId: FACULTY,
      organizationId: ORG,
      action: 'manual_approve',
      targetType: 'certificate',
      targetId: CERT,
    });
  });

  it('never writes the legacy status column, and records a manual verification_method', async () => {
    asFaculty();
    await approvePOST(req('POST', '/x', { certificateId: CERT, status: 'verified' }));
    const certWrites = writesTo('certificates');
    expect(certWrites.length).toBeGreaterThan(0);
    for (const w of certWrites) expect(w.values).not.toHaveProperty('status');
    expect(db.tables.certificates[0]).not.toHaveProperty('status');
    expect(db.tables.certificates[0]).toMatchObject({ verification_method: 'manual' });
  });

  it('ignores a legacy metadataId and never touches certificate_metadata', async () => {
    asFaculty();
    const { status } = await json(
      await approvePOST(req('POST', '/x', { certificateId: CERT, status: 'verified', metadataId: 'm1' }))
    );
    expect(status).toBe(200);
    expect(db.log.filter(l => l.endsWith(':certificate_metadata'))).toEqual([]);
    expect(auditEntries()[0].details).not.toHaveProperty('metadataId');
  });

  it('accepts the legacy "approved" status and writes "verified"', async () => {
    asFaculty();
    const { status } = await json(await approvePOST(req('POST', '/x', { certificateId: CERT, status: 'approved' })));
    expect(status).toBe(200);
    expect(certStatus()).toBe('verified');
  });

  it('rejects unknown status values', async () => {
    asFaculty();
    const { status } = await json(await approvePOST(req('POST', '/x', { certificateId: CERT, status: 'pending' })));
    expect(status).toBe(400);
    expect(certStatus()).toBe('pending');
  });

  it('second approval returns 409 and sends no second email / audit row', async () => {
    asFaculty();
    await approvePOST(req('POST', '/x', { certificateId: CERT, status: 'verified' }));
    const second = await json(await approvePOST(req('POST', '/x', { certificateId: CERT, status: 'verified' })));
    expect(second.status).toBe(409);
    expect(h.sendApproved).toHaveBeenCalledTimes(1);
    expect(auditEntries()).toHaveLength(1);
  });

  it('refuses self-approval', async () => {
    asFaculty({ certificates: [cert({ student_id: FACULTY })] });
    const { status } = await json(await approvePOST(req('POST', '/x', { certificateId: CERT, status: 'verified' })));
    expect(status).toBe(403);
    expect(certStatus()).toBe('pending');
    expect(h.sendApproved).not.toHaveBeenCalled();
    expect(auditEntries()).toHaveLength(0);
  });

  it('refuses a certificate from another organization (404) without writing', async () => {
    asFaculty({ certificates: [cert({ organization_id: OTHER_ORG })] });
    const { status } = await json(await approvePOST(req('POST', '/x', { certificateId: CERT, status: 'verified' })));
    expect(status).toBe(404);
    expect(certStatus()).toBe('pending');
    expect(db.log).not.toContain('update:certificates');
  });

  it('refuses a reviewer whose role is still pending approval', async () => {
    asFaculty({ user_roles: [facultyRole(ORG, { approval_status: 'pending' })] });
    const { status } = await json(await approvePOST(req('POST', '/x', { certificateId: CERT, status: 'verified' })));
    expect(status).toBe(403);
    expect(certStatus()).toBe('pending');
  });

  it('works for a user with several role rows (student elsewhere + faculty here)', async () => {
    asFaculty({
      user_roles: [
        { user_id: FACULTY, role: 'student', organization_id: OTHER_ORG, approval_status: 'approved' },
        facultyRole(),
      ],
    });
    const { status } = await json(await approvePOST(req('POST', '/x', { certificateId: CERT, status: 'verified' })));
    expect(status).toBe(200);
  });

  it('treats a zero-row (RLS-blocked) update as failure, not success', async () => {
    asFaculty();
    db.rlsBlocked.add('update:certificates');
    const { status } = await json(await approvePOST(req('POST', '/x', { certificateId: CERT, status: 'verified' })));
    expect(status).toBe(409);
    expect(h.sendApproved).not.toHaveBeenCalled();
    expect(auditEntries()).toHaveLength(0);
  });

  it('scopes the update in the WHERE clause (conditional on current status + org)', async () => {
    // a concurrent writer already moved the row: the pre-read said pending, update matches nothing
    asFaculty();
    const origFrom = db.client.from;
    let first = true;
    db.client.from = (t: string) => {
      const q = origFrom(t);
      if (t === 'certificates' && first) {
        // flip status right after the first read (the SELECT)
        const origThen = q.then.bind(q);
        q.then = (a: any, b: any) => {
          const r = origThen(a, b);
          if (first) {
            first = false;
            db.tables.certificates[0].verification_status = 'rejected';
          }
          return r;
        };
      }
      return q;
    };
    const { status } = await json(await approvePOST(req('POST', '/x', { certificateId: CERT, status: 'verified' })));
    expect(status).toBe(409);
    expect(certStatus()).toBe('rejected');
    expect(h.sendApproved).not.toHaveBeenCalled();
  });

  it('rejecting a verified certificate revokes ALL active credentials', async () => {
    asFaculty({
      certificates: [cert({ verification_status: 'verified' })],
      verifiable_credentials: [vcRow('vc-a', CERT), vcRow('vc-b', CERT), vcRow('vc-other', CERT2)],
    });
    const { status, body } = await json(await approvePOST(req('POST', '/x', { certificateId: CERT, status: 'rejected' })));
    expect(status).toBe(200);
    expect(body.data.revokedCredentials).toBe(2);
    expect(certStatus()).toBe('rejected');
    expect(db.tables.certificates[0]).toMatchObject({ verification_status: 'rejected', faculty_id: FACULTY });
    expect(db.tables.certificates[0]).not.toHaveProperty('status');
    const byId = Object.fromEntries(db.tables.verifiable_credentials.map(v => [v.id, v.status]));
    expect(byId).toEqual({ 'vc-a': 'revoked', 'vc-b': 'revoked', 'vc-other': 'active' });
    // revocation_list does not exist in production: status on verifiable_credentials is the source of truth.
    expect(db.inserts.revocation_list).toBeUndefined();
    expect(h.sendRejected).toHaveBeenCalledTimes(1);
  });

  it('issue:true approves and issues in one request, idempotently', async () => {
    asFaculty();
    const { status, body } = await json(
      await approvePOST(req('POST', '/x', { certificateId: CERT, status: 'verified', issue: true }))
    );
    expect(status).toBe(200);
    expect(body.data.issuance).toMatchObject({ ok: true, reused: false });
    expect(db.inserts.verifiable_credentials).toHaveLength(1);
  });

  it('issue:true reports issuance failure without undoing the approval', async () => {
    asFaculty();
    db.errors['insert:verifiable_credentials'] = 'boom';
    const { status, body } = await json(
      await approvePOST(req('POST', '/x', { certificateId: CERT, status: 'verified', issue: true }))
    );
    expect(status).toBe(200);
    expect(body.data.issuance.ok).toBe(false);
    expect(certStatus()).toBe('verified');
  });

  it('is denied for a non-reviewer role (middleware)', async () => {
    asFaculty();
    h.role = 'student';
    const { status } = await json(await approvePOST(req('POST', '/x', { certificateId: CERT, status: 'verified' })));
    expect(status).toBe(403);
  });
});

// ===========================================================================
describe('POST /api/certificates/batch-approve', () => {
  const two = () => [cert(), cert({ id: CERT2 })];

  it('dashboard payload {certificateIds, action:"approve"} succeeds and writes "verified"', async () => {
    asFaculty({ certificates: two() });
    const { status, body } = await json(
      await batchPOST(req('POST', '/x', { certificateIds: [CERT, CERT2], action: 'approve' }))
    );
    expect(status).toBe(200);
    expect(body.data).toMatchObject({ total: 2, succeeded: 2, failed: 0, status: 'verified' });
    expect(certStatus(CERT)).toBe('verified');
    expect(certStatus(CERT2)).toBe('verified');
    expect(db.tables.certificates.every(c => c.verification_status !== 'approved')).toBe(true);
    expect(db.tables.certificates.every(c => c.faculty_id === FACULTY && !('status' in c))).toBe(true);
    expect(auditEntries().map(a => a.action)).toEqual(['batch_approve', 'batch_approve']);
  });

  it('canonical {status:"rejected"} and alias action:"reject" write "rejected"', async () => {
    asFaculty({ certificates: two() });
    const a = await json(await batchPOST(req('POST', '/x', { certificateIds: [CERT], status: 'rejected' })));
    const b = await json(await batchPOST(req('POST', '/x', { certificateIds: [CERT2], action: 'reject' })));
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(certStatus(CERT)).toBe('rejected');
    expect(certStatus(CERT2)).toBe('rejected');
  });

  it('per-id results: failures (self-owned, other org, already verified) do not block the rest (207)', async () => {
    const SELF = uuid(12);
    const FOREIGN = uuid(13);
    const DONE = uuid(14);
    asFaculty({
      certificates: [
        cert(),
        cert({ id: SELF, student_id: FACULTY }),
        cert({ id: FOREIGN, organization_id: OTHER_ORG }),
        cert({ id: DONE, verification_status: 'verified' }),
      ],
    });
    const { status, body } = await json(
      await batchPOST(req('POST', '/x', { certificateIds: [CERT, SELF, FOREIGN, DONE], status: 'verified' }))
    );
    expect(status).toBe(207);
    expect(body.data).toMatchObject({ total: 4, succeeded: 1, failed: 3 });
    const byId = Object.fromEntries(body.data.results.map((r: any) => [r.id, r.ok]));
    expect(byId).toEqual({ [CERT]: true, [SELF]: false, [FOREIGN]: false, [DONE]: false });
    expect(certStatus(CERT)).toBe('verified');
    expect(certStatus(SELF)).toBe('pending');
    expect(certStatus(FOREIGN)).toBe('pending');
    expect(h.sendApproved).toHaveBeenCalledTimes(1);
  });

  it('validates input: missing/oversized/non-uuid ids, missing/invalid status', async () => {
    asFaculty();
    const bad = async (payload: unknown) => (await batchPOST(req('POST', '/x', payload))).status;
    expect(await bad({ status: 'verified' })).toBe(422);
    expect(await bad({ certificateIds: [], status: 'verified' })).toBe(422);
    expect(await bad({ certificateIds: ['nope'], status: 'verified' })).toBe(422);
    expect(await bad({ certificateIds: Array.from({ length: 101 }, (_, i) => uuid(1000 + i)), status: 'verified' })).toBe(422);
    expect(await bad({ certificateIds: [CERT] })).toBe(422);
    expect(await bad({ certificateIds: [CERT], status: 'pending' })).toBe(422);
    expect(certStatus()).toBe('pending');
  });

  it('de-duplicates ids so a certificate is processed once', async () => {
    asFaculty();
    const { status, body } = await json(await batchPOST(req('POST', '/x', { certificateIds: [CERT, CERT], status: 'verified' })));
    expect(status).toBe(200);
    expect(body.data.total).toBe(1);
    expect(h.sendApproved).toHaveBeenCalledTimes(1);
  });
});

// ===========================================================================
describe('POST /api/certificates/revert-approval', () => {
  it('reverts a verified certificate and revokes BOTH active credentials', async () => {
    asFaculty({
      certificates: [cert({ verification_status: 'verified' })],
      verifiable_credentials: [vcRow('vc-a', CERT), vcRow('vc-b', CERT)],
    });
    const { status, body } = await json(await revertPOST(req('POST', '/x', { certificateId: CERT, reason: 'oops' })));
    expect(status).toBe(200);
    expect(body.data).toMatchObject({ newStatus: 'pending', revokedCredentials: 2 });
    expect(certStatus()).toBe('pending');
    expect(db.tables.certificates[0]).toMatchObject({ faculty_id: null });
    expect(db.tables.certificates[0]).not.toHaveProperty('status');
    expect(vcStatuses()).toEqual(['revoked', 'revoked']);
    expect(db.tables.verifiable_credentials[0].revoked_reason).toBe('oops');
    expect(auditEntries()[0]).toMatchObject({ action: 'revert_approval', targetType: 'certificate', targetId: CERT, actorId: FACULTY });
  });

  it('refuses to revert a non-verified certificate (409)', async () => {
    asFaculty();
    const { status } = await json(await revertPOST(req('POST', '/x', { certificateId: CERT })));
    expect(status).toBe(409);
  });

  it('refuses other-organization certificates and self-review', async () => {
    asFaculty({ certificates: [cert({ verification_status: 'verified', organization_id: OTHER_ORG })] });
    expect((await revertPOST(req('POST', '/x', { certificateId: CERT }))).status).toBe(404);
    asFaculty({ certificates: [cert({ verification_status: 'verified', student_id: FACULTY })] });
    expect((await revertPOST(req('POST', '/x', { certificateId: CERT }))).status).toBe(403);
    expect(certStatus()).toBe('verified');
  });

  it('if revocation fails the status change is rolled back (never pending with live credentials)', async () => {
    asFaculty({
      certificates: [cert({ verification_status: 'verified', faculty_id: uuid(88) })],
      verifiable_credentials: [vcRow('vc-a', CERT)],
    });
    db.errors['update:verifiable_credentials'] = 'db down';
    const { status } = await json(await revertPOST(req('POST', '/x', { certificateId: CERT })));
    expect(status).toBe(500);
    expect(certStatus()).toBe('verified');
    expect(db.tables.certificates[0]).toMatchObject({ faculty_id: uuid(88) });
    // the compensation write restores verification_status / faculty_id only, never the legacy column
    for (const w of writesTo('certificates')) expect(w.values).not.toHaveProperty('status');
    expect(db.tables.certificates[0]).not.toHaveProperty('status');
    expect(vcStatuses()).toEqual(['active']);
  });
});

// ===========================================================================
describe('POST /api/certificates/issue', () => {
  const asOwner = (tables: Record<string, Row[]> = {}) =>
    setup(
      {
        user_roles: [{ user_id: STUDENT, role: 'student', organization_id: ORG, approval_status: 'approved' }],
        certificates: [cert({ verification_status: 'verified' })],
        verifiable_credentials: [],
        audit_logs: [],
        ...tables,
      },
      { id: STUDENT },
      'student'
    );

  it('issues once; the second call returns the same credential (no second insert)', async () => {
    asOwner();
    const first = await json(await issuePOST(req('POST', '/x', { certificateId: CERT })));
    expect(first.status).toBe(201);
    const second = await json(await issuePOST(req('POST', '/x', { certificateId: CERT })));
    expect(second.status).toBe(200);
    expect(second.body.data.reused).toBe(true);
    expect(second.body.data.id).toBe(first.body.data.id);
    expect(db.inserts.verifiable_credentials).toHaveLength(1);
    expect(h.signed).toHaveLength(1);
    expect(db.inserts.verifiable_credentials[0]).toMatchObject({ student_id: STUDENT, status: 'active' });
    expect(h.signed[0].params.issuerDid).toBe('did:web:test.example');
  });

  it('accepts the dashboard-style credentialSubject.certificateId and ignores client claims', async () => {
    asOwner();
    const { status } = await json(
      await issuePOST(req('POST', '/x', { credentialSubject: { certificateId: CERT, title: 'FORGED' } }))
    );
    expect(status).toBe(201);
    expect(h.signed[0].params.credential.credentialSubject.title).toBe('Cloud 101');
  });

  it('re-issues after the previous credential was revoked', async () => {
    asOwner({ verifiable_credentials: [vcRow('vc-old', CERT, 'revoked')] });
    const { status, body } = await json(await issuePOST(req('POST', '/x', { certificateId: CERT })));
    expect(status).toBe(201);
    expect(body.data.id).not.toBe('vc-old');
  });

  it('refuses unverified certificates', async () => {
    asOwner({ certificates: [cert({ verification_status: 'pending' })] });
    expect((await issuePOST(req('POST', '/x', { certificateId: CERT }))).status).toBe(403);
    expect(db.inserts.verifiable_credentials ?? []).toHaveLength(0);
  });

  it('refuses a stranger and a faculty of another org; allows faculty of the cert org (multi-role user)', async () => {
    asOwner();
    db.user = { id: uuid(99) };
    expect((await issuePOST(req('POST', '/x', { certificateId: CERT }))).status).toBe(403);

    setup(
      {
        user_roles: [facultyRole(OTHER_ORG)],
        certificates: [cert({ verification_status: 'verified' })],
        verifiable_credentials: [],
      },
      { id: FACULTY },
      'faculty'
    );
    expect((await issuePOST(req('POST', '/x', { certificateId: CERT }))).status).toBe(403);

    setup(
      {
        user_roles: [
          { user_id: FACULTY, role: 'student', organization_id: OTHER_ORG, approval_status: 'approved' },
          facultyRole(ORG),
        ],
        certificates: [cert({ verification_status: 'verified' })],
        verifiable_credentials: [],
      },
      { id: FACULTY },
      'faculty'
    );
    expect((await issuePOST(req('POST', '/x', { certificateId: CERT }))).status).toBe(201);
  });

  it('ignores a reviewer role that is pending approval', async () => {
    setup(
      {
        user_roles: [facultyRole(ORG, { approval_status: 'pending' })],
        certificates: [cert({ verification_status: 'verified' })],
        verifiable_credentials: [],
      },
      { id: FACULTY },
      'faculty'
    );
    expect((await issuePOST(req('POST', '/x', { certificateId: CERT }))).status).toBe(403);
  });

  it('validates the certificate id and 404s unknown certificates', async () => {
    asOwner();
    expect((await issuePOST(req('POST', '/x', {}))).status).toBe(400);
    expect((await issuePOST(req('POST', '/x', { certificateId: 'abc' }))).status).toBe(400);
    expect((await issuePOST(req('POST', '/x', { certificateId: uuid(555) }))).status).toBe(404);
  });
});

// ===========================================================================
describe('DELETE /api/certificates/delete', () => {
  const asStudent = (tables: Record<string, Row[]> = {}) =>
    setup(
      {
        user_roles: [{ user_id: STUDENT, role: 'student', organization_id: ORG, approval_status: 'approved' }],
        certificates: [cert()],
        verifiable_credentials: [],
        ...tables,
      },
      { id: STUDENT },
      'student'
    );

  it('order: revoke credentials -> delete row -> delete storage object', async () => {
    asStudent({ certificates: [cert({ verification_status: 'rejected' })], verifiable_credentials: [vcRow('vc-a', CERT)] });
    const { status } = await json(await deleteDELETE(req('DELETE', '/x', { certificateId: CERT })));
    expect(status).toBe(200);
    const iRevoke = db.log.indexOf('update:verifiable_credentials');
    const iDelete = db.log.indexOf('delete:certificates');
    const iStorage = db.log.indexOf('storage.remove');
    expect(iRevoke).toBeGreaterThanOrEqual(0);
    expect(iDelete).toBeGreaterThan(iRevoke);
    expect(iStorage).toBeGreaterThan(iDelete);
    expect(db.storageRemoved).toEqual([`${STUDENT}/1_cert.pdf`]);
    expect(db.tables.certificates).toHaveLength(0);
    expect(vcStatuses()).toEqual(['revoked']);
  });

  it('zero-row delete (RLS) returns 409 and leaves the storage object alone', async () => {
    asStudent();
    db.rlsBlocked.add('delete:certificates');
    const { status } = await json(await deleteDELETE(req('DELETE', '/x', { certificateId: CERT })));
    expect(status).toBe(409);
    expect(db.storageRemoved).toEqual([]);
    expect(db.log).not.toContain('storage.remove');
    expect(db.tables.certificates).toHaveLength(1);
  });

  it('a DB error on delete aborts before touching storage', async () => {
    asStudent();
    db.errors['delete:certificates'] = 'fk violation';
    const { status } = await json(await deleteDELETE(req('DELETE', '/x', { certificateId: CERT })));
    expect(status).toBe(500);
    expect(db.storageRemoved).toEqual([]);
  });

  it('a student cannot delete their own verified certificate (and credentials stay active)', async () => {
    asStudent({ certificates: [cert({ verification_status: 'verified' })], verifiable_credentials: [vcRow('vc-a', CERT)] });
    const { status } = await json(await deleteDELETE(req('DELETE', '/x', { certificateId: CERT })));
    expect(status).toBe(403);
    expect(db.tables.certificates).toHaveLength(1);
    expect(vcStatuses()).toEqual(['active']);
  });

  it('a student cannot delete someone else\'s certificate', async () => {
    asStudent({ certificates: [cert({ student_id: uuid(77) })] });
    expect((await deleteDELETE(req('DELETE', '/x', { certificateId: CERT }))).status).toBe(403);
    expect(db.tables.certificates).toHaveLength(1);
  });

  it('an admin of the org can delete a verified certificate; credentials are revoked first', async () => {
    setup(
      {
        user_roles: [{ user_id: FACULTY, role: 'admin', organization_id: ORG, approval_status: 'approved' }],
        certificates: [cert({ verification_status: 'verified' })],
        verifiable_credentials: [vcRow('vc-a', CERT), vcRow('vc-b', CERT)],
      },
      { id: FACULTY },
      'admin'
    );
    const { status } = await json(await deleteDELETE(req('DELETE', '/x', { certificateId: CERT })));
    expect(status).toBe(200);
    expect(vcStatuses()).toEqual(['revoked', 'revoked']);
    expect(db.tables.certificates).toHaveLength(0);
    expect(auditEntries()[0]).toMatchObject({ action: 'delete_certificate', targetType: 'certificate', targetId: CERT, actorId: FACULTY });
  });

  it('an admin of ANOTHER org is refused', async () => {
    setup(
      {
        user_roles: [{ user_id: FACULTY, role: 'admin', organization_id: OTHER_ORG, approval_status: 'approved' }],
        certificates: [cert({ verification_status: 'pending' })],
        verifiable_credentials: [],
      },
      { id: FACULTY },
      'admin'
    );
    expect((await deleteDELETE(req('DELETE', '/x', { certificateId: CERT }))).status).toBe(403);
    expect(db.tables.certificates).toHaveLength(1);
  });

  it('does not remove storage objects that are not in the owner\'s folder', async () => {
    asStudent({
      certificates: [
        cert({ file_url: `${SUPABASE_URL}/storage/v1/object/public/certificates/${uuid(77)}/victim.pdf` }),
      ],
    });
    const { status } = await json(await deleteDELETE(req('DELETE', '/x', { certificateId: CERT })));
    expect(status).toBe(200);
    expect(db.storageRemoved).toEqual([]);
  });

  it('returns 404 for unknown ids and 400 for invalid ones', async () => {
    asStudent();
    expect((await deleteDELETE(req('DELETE', '/x', { certificateId: uuid(404) }))).status).toBe(404);
    expect((await deleteDELETE(req('DELETE', '/x', { certificateId: 'x' }))).status).toBe(400);
  });
});

// ===========================================================================
describe('POST /api/certificates/create', () => {
  const asStudentWithProfile = () =>
    setup(
      { profiles: [{ id: STUDENT, organization_id: ORG }], certificates: [] },
      { id: STUDENT },
      'student'
    );
  const good = `${SUPABASE_URL}/storage/v1/object/public/certificates/${STUDENT}/1700_cert.pdf`;

  it('accepts a legitimate URL and stores the certificate as pending', async () => {
    asStudentWithProfile();
    const { status } = await json(await createPOST(req('POST', '/x', { publicUrl: good, ocr: { title: 'T', date_issued: '2024-01-02' } })));
    expect(status).toBe(201);
    expect(db.inserts.certificates[0]).toMatchObject({
      student_id: STUDENT,
      organization_id: ORG,
      file_url: good,
      verification_status: 'pending',
      date_issued: '2024-01-02',
    });
  });

  it('normalises an empty OCR date to a real date', async () => {
    asStudentWithProfile();
    await createPOST(req('POST', '/x', { publicUrl: good, ocr: { title: 'T', date_issued: '' } }));
    expect(db.inserts.certificates[0].date_issued).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  const VICTIM = uuid(77);
  const bypasses: Record<string, string> = {
    'path confusion': `${SUPABASE_URL}/storage/v1/object/${STUDENT}/object/public/certificates/${VICTIM}/f.pdf`,
    'victim folder': `${SUPABASE_URL}/storage/v1/object/public/certificates/${VICTIM}/f.pdf`,
    'own id only in query': `${SUPABASE_URL}/storage/v1/object/public/certificates/${VICTIM}/f.pdf?a=/${STUDENT}/`,
    'traversal': `${SUPABASE_URL}/storage/v1/object/public/certificates/${STUDENT}/../${VICTIM}/f.pdf`,
    'encoded traversal': `${SUPABASE_URL}/storage/v1/object/public/certificates/${STUDENT}/%2e%2e/${VICTIM}/f.pdf`,
    'foreign host with prefix': `https://proj.supabase.co.evil.test/storage/v1/object/public/certificates/${STUDENT}/f.pdf`,
    'external url': `https://evil.test/${STUDENT}/f.pdf`,
    'wrong bucket': `${SUPABASE_URL}/storage/v1/object/public/avatars/${STUDENT}/f.pdf`,
    'non-string': '' as string,
  };
  for (const [name, url] of Object.entries(bypasses)) {
    it(`rejects file_url bypass: ${name}`, async () => {
      asStudentWithProfile();
      const res = await createPOST(req('POST', '/x', { publicUrl: url }));
      expect(res.status).toBe(400);
      expect(db.inserts.certificates ?? []).toHaveLength(0);
    });
  }

  it('rejects a numeric publicUrl', async () => {
    asStudentWithProfile();
    expect((await createPOST(req('POST', '/x', { publicUrl: 123 }))).status).toBe(400);
  });

  it('requires authentication', async () => {
    asStudentWithProfile();
    db.user = null;
    expect((await createPOST(req('POST', '/x', { publicUrl: good }))).status).toBe(401);
  });
});

// ===========================================================================
describe('POST /api/recruiter/bulk-verify (retired)', () => {
  it('returns 410 and never touches the database', async () => {
    setup({ certificates: [cert()], user_roles: [] }, { id: uuid(5) }, 'recruiter');
    const res = await bulkVerifyPOST();
    expect(res.status).toBe(410);
    expect(db.log).toEqual([]);
    expect(certStatus()).toBe('pending');
  });
});
