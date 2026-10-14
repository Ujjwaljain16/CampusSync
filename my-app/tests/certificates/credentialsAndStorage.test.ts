// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any */
// Credential lookups by certificate_id, service-role credential writes, 23505 handling and storage_path.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { createFakeDb, uuid, type FakeDb, type Row } from './fakeSupabase';

const h = vi.hoisted(() => ({
  db: null as any,
  role: 'student',
  vcCounter: 0,
  signed: [] as any[],
  audits: [] as Array<{ client: any; entry: any }>,
}));

vi.mock('@/lib/supabaseServer', () => ({
  createSupabaseServerClient: async () => h.db.client,
  // service-role client: same data, but a different client object so writes can be attributed
  createSupabaseAdminClient: async () => ({
    ...h.db.adminClient,
    auth: { admin: { getUserById: async () => ({ data: { user: { email: 's@campus.test' } }, error: null }) } },
  }),
  requireRole: async (allowed: string[]) => {
    const user = h.db.user;
    if (!user) return { user: {}, role: 'student', authorized: false, message: 'Authentication required' };
    return allowed.includes(h.role)
      ? { user, role: h.role, authorized: true }
      : { user, role: h.role, authorized: false, message: 'Access denied' };
  },
}));

vi.mock('@/lib/api/utils/audit', () => ({
  writeAudit: async (client: any, entry: any) => {
    h.audits.push({ client, entry });
    return true;
  },
}));

vi.mock('@/lib/emailService', () => ({
  emailService: { sendCertificateApproved: async () => true, sendCertificateRejected: async () => true },
}));

vi.mock('@/lib/envValidator', () => ({
  getIssuerDID: () => 'did:web:test.example',
  getBaseUrl: () => 'https://app.test',
}));

vi.mock('@/lib/vc', () => ({
  signCredential: async (p: any) => {
    const vc = {
      id: `urn:uuid:vc-${++h.vcCounter}`,
      issuer: p.issuerDid,
      issuanceDate: '2025-01-01T00:00:00.000Z',
      credentialSubject: p.credential.credentialSubject,
      proof: { jws: 'x' },
    };
    h.signed.push(vc);
    return vc;
  },
}));

import { POST as issuePOST } from '@/app/api/certificates/issue/route';
import { POST as approvePOST } from '@/app/api/certificates/approve/route';
import { POST as revertPOST } from '@/app/api/certificates/revert-approval/route';
import { DELETE as deleteDELETE } from '@/app/api/certificates/delete/route';
import { POST as createPOST } from '@/app/api/certificates/create/route';

const ORG = uuid(100);
const FACULTY = uuid(1);
const STUDENT = uuid(2);
const CERT = uuid(10);
const CERT2 = uuid(11);
const SUPABASE_URL = 'https://proj.supabase.co';
const OWN_URL = `${SUPABASE_URL}/storage/v1/object/public/certificates/${STUDENT}/1_cert.pdf`;

const req = (method: string, body?: unknown) =>
  new NextRequest('http://localhost/x', {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const cert = (over: Row = {}): Row => ({
  id: CERT,
  student_id: STUDENT,
  organization_id: ORG,
  verification_status: 'verified',
  faculty_id: null,
  title: 'Cloud 101',
  institution: 'MIT',
  date_issued: '2024-05-01',
  description: 'desc',
  file_url: OWN_URL,
  ...over,
});

const vcRow = (id: string, certId: string, over: Row = {}): Row => ({
  id,
  student_id: STUDENT,
  certificate_id: certId,
  organization_id: ORG,
  status: 'active',
  created_at: '2025-01-01T00:00:00.000Z',
  credential: { id, credentialSubject: { id: STUDENT, certificateId: certId } },
  ...over,
});

let db: FakeDb;
const setup = (tables: Record<string, Row[]>, userId: string, role: string, orgRole = role) => {
  db = createFakeDb({
    user_roles: [{ user_id: userId, role: orgRole, organization_id: ORG, approval_status: 'approved' }],
    certificates: [cert()],
    verifiable_credentials: [],
    documents: [],
    profiles: [{ id: STUDENT, organization_id: ORG }],
    ...tables,
  });
  db.user = { id: userId };
  h.db = db;
  h.role = role;
};
const asStudent = (tables: Record<string, Row[]> = {}) => setup(tables, STUDENT, 'student');
const asFaculty = (tables: Record<string, Row[]> = {}) => setup(tables, FACULTY, 'faculty');

const json = async (res: Response) => ({ status: res.status, body: await res.json() });
const writesTo = (table: string) => db.writes.filter(w => w.table === table);
const auditEntries = () => h.audits.map(a => a.entry);
const vcStatusById = () => Object.fromEntries(db.tables.verifiable_credentials.map(v => [v.id, v.status]));

beforeEach(() => {
  h.vcCounter = 0;
  h.signed = [];
  h.audits = [];
  process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_URL;
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'debug').mockImplementation(() => {});
});

describe('issuing a credential', () => {
  it('inserts with the service-role client, never the user client, and passes certificate_id + organization_id', async () => {
    asStudent();
    const { status } = await json(await issuePOST(req('POST', { certificateId: CERT })));
    expect(status).toBe(201);
    expect(writesTo('verifiable_credentials').map(w => [w.op, w.client])).toContainEqual(['insert', 'admin']);
    expect(writesTo('verifiable_credentials').filter(w => w.client === 'user')).toEqual([]);
    expect(db.inserts.verifiable_credentials[0]).toMatchObject({
      certificate_id: CERT,
      organization_id: ORG,
      student_id: STUDENT,
      status: 'active',
    });
    expect(auditEntries()).toEqual([
      expect.objectContaining({
        actorId: STUDENT,
        organizationId: ORG,
        action: 'issue_vc',
        targetType: 'certificate',
        targetId: CERT,
        details: { credentialId: 'urn:uuid:vc-1' },
      }),
    ]);
  });

  it('the idempotency check reads the certificate_id column, not the signed JSON', async () => {
    // column says CERT while the JSON subject names another certificate: still CERT's active credential
    asStudent({
      verifiable_credentials: [vcRow('vc-col', CERT, { credential: { id: 'vc-col', credentialSubject: { certificateId: CERT2 } } })],
    });
    const hit = await json(await issuePOST(req('POST', { certificateId: CERT })));
    expect(hit.status).toBe(200);
    expect(hit.body.data).toMatchObject({ id: 'vc-col', reused: true });
    expect(db.inserts.verifiable_credentials ?? []).toHaveLength(0);
    expect(writesTo('verifiable_credentials')).toEqual([]);

    // the reverse: JSON says CERT but the column says another certificate: not a credential of CERT
    asStudent({
      verifiable_credentials: [vcRow('vc-json', CERT2, { credential: { id: 'vc-json', credentialSubject: { certificateId: CERT } } })],
    });
    const miss = await json(await issuePOST(req('POST', { certificateId: CERT })));
    expect(miss.status).toBe(201);
    expect(miss.body.data.id).not.toBe('vc-json');
  });

  it('a unique violation (23505, lost a concurrent issue race) returns the existing active credential', async () => {
    asStudent({ verifiable_credentials: [vcRow('vc-winner', CERT)] });
    db.uniqueActiveCredential = true;
    // the first read (before the insert) does not see the winner yet
    const origFrom = db.adminClient.from;
    let firstRead = true;
    db.adminClient.from = (t: string) => {
      if (t === 'verifiable_credentials' && firstRead) {
        firstRead = false;
        const empty: any = {};
        empty.select = empty.eq = empty.order = () => empty;
        empty.then = (ok: any) => Promise.resolve({ data: [], error: null }).then(ok);
        return empty;
      }
      return origFrom(t);
    };
    const { status, body } = await json(await issuePOST(req('POST', { certificateId: CERT })));
    expect(status).toBe(200);
    expect(body.data).toMatchObject({ id: 'vc-winner', reused: true });
    expect(db.inserts.verifiable_credentials ?? []).toHaveLength(0);
    expect(vcStatusById()).toEqual({ 'vc-winner': 'active' });
    expect(auditEntries()).toHaveLength(0); // the winner audited its own issuance
  });

  it('a 23505 with no credential to re-read is still a failure', async () => {
    asStudent();
    db.errors['insert:verifiable_credentials'] = { message: 'duplicate key', code: '23505' };
    expect((await issuePOST(req('POST', { certificateId: CERT }))).status).toBe(500);
  });

  it('other insert errors stay a 500', async () => {
    asStudent();
    db.errors['insert:verifiable_credentials'] = { message: 'boom', code: '42501' };
    expect((await issuePOST(req('POST', { certificateId: CERT }))).status).toBe(500);
  });

  it('approve + issue:true also writes the credential with the service role', async () => {
    asFaculty({ certificates: [cert({ verification_status: 'pending' })] });
    const { status, body } = await json(await approvePOST(req('POST', { certificateId: CERT, status: 'verified', issue: true })));
    expect(status).toBe(200);
    expect(body.data.issuance).toMatchObject({ ok: true, reused: false });
    expect(writesTo('verifiable_credentials').every(w => w.client === 'admin')).toBe(true);
    expect(writesTo('certificates').every(w => !('status' in (w.values ?? {})))).toBe(true);
  });
});

describe('revoking credentials', () => {
  it('revert revokes by certificate_id (service role only), leaving other certificates alone', async () => {
    asFaculty({
      verifiable_credentials: [
        vcRow('vc-a', CERT),
        // JSON says CERT but the column says CERT2: must NOT be revoked
        vcRow('vc-b', CERT2, { credential: { id: 'vc-b', credentialSubject: { certificateId: CERT } } }),
        vcRow('vc-c', CERT2),
        vcRow('vc-old', CERT, { status: 'revoked' }),
      ],
    });
    const { status, body } = await json(await revertPOST(req('POST', { certificateId: CERT })));
    expect(status).toBe(200);
    expect(body.data.revokedCredentials).toBe(1);
    expect(vcStatusById()).toEqual({ 'vc-a': 'revoked', 'vc-b': 'active', 'vc-c': 'active', 'vc-old': 'revoked' });
    expect(writesTo('verifiable_credentials').length).toBeGreaterThan(0);
    expect(writesTo('verifiable_credentials').every(w => w.client === 'admin')).toBe(true);
  });

  it('deleting a certificate revokes its credentials with the service role', async () => {
    asStudent({ certificates: [cert({ verification_status: 'rejected' })], verifiable_credentials: [vcRow('vc-a', CERT)] });
    const { status } = await json(await deleteDELETE(req('DELETE', { certificateId: CERT })));
    expect(status).toBe(200);
    expect(vcStatusById()).toEqual({ 'vc-a': 'revoked' });
    expect(writesTo('verifiable_credentials').every(w => w.client === 'admin')).toBe(true);
  });
});

describe('certificate files: storage_path', () => {
  it('create persists storage_path (parsed from the validated URL) and no legacy status', async () => {
    asStudent({ certificates: [] });
    const { status } = await json(await createPOST(req('POST', { publicUrl: OWN_URL, ocr: { title: 'T' } })));
    expect(status).toBe(201);
    expect(db.inserts.certificates[0]).toMatchObject({ file_url: OWN_URL, storage_path: `${STUDENT}/1_cert.pdf` });
    expect(db.inserts.certificates[0]).not.toHaveProperty('status');
  });

  it('delete removes the object named by storage_path', async () => {
    asStudent({ certificates: [cert({ verification_status: 'pending', storage_path: `${STUDENT}/stored.pdf` })] });
    const { status } = await json(await deleteDELETE(req('DELETE', { certificateId: CERT })));
    expect(status).toBe(200);
    expect(db.storageRemoved).toEqual([`${STUDENT}/stored.pdf`]);
  });

  it('delete falls back to parsing file_url for rows without storage_path', async () => {
    asStudent({ certificates: [cert({ verification_status: 'pending', storage_path: null })] });
    await deleteDELETE(req('DELETE', { certificateId: CERT }));
    expect(db.storageRemoved).toEqual([`${STUDENT}/1_cert.pdf`]);
  });

  it('delete never removes a storage_path outside the owner folder', async () => {
    asStudent({
      certificates: [
        cert({
          verification_status: 'pending',
          storage_path: `${uuid(77)}/victim.pdf`,
          file_url: `${SUPABASE_URL}/storage/v1/object/public/certificates/${uuid(77)}/victim.pdf`,
        }),
      ],
    });
    expect((await deleteDELETE(req('DELETE', { certificateId: CERT }))).status).toBe(200);
    expect(db.storageRemoved).toEqual([]);

    asStudent({
      certificates: [cert({ verification_status: 'pending', storage_path: `${STUDENT}/../${uuid(77)}/victim.pdf`, file_url: null })],
    });
    await deleteDELETE(req('DELETE', { certificateId: CERT }));
    expect(db.storageRemoved).toEqual([]);
  });

  it('delete does not touch certificate_metadata and audits through writeAudit', async () => {
    asStudent({ certificates: [cert({ verification_status: 'pending' })] });
    await deleteDELETE(req('DELETE', { certificateId: CERT }));
    expect(db.log.filter(l => l.endsWith(':certificate_metadata'))).toEqual([]);
    expect(auditEntries()).toEqual([
      expect.objectContaining({
        actorId: STUDENT,
        organizationId: ORG,
        action: 'delete_certificate',
        targetType: 'certificate',
        targetId: CERT,
        details: { previous_status: 'pending' },
      }),
    ]);
  });
});
