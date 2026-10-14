// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * End-to-end through the real routes/services (fake in-memory database, REAL jose keys):
 * issue -> credentialStatus embedded -> revoke -> bit flipped -> public signed list shows it.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { generateKeyPair, exportJWK, importJWK, jwtVerify, decodeProtectedHeader, type JWK } from 'jose';
import { createFakeDb, uuid, type FakeDb, type Row } from '../certificates/fakeSupabase';
import { createFakeStatusDb, type FakeStatusDb } from './fakeStatusDb';

const h = vi.hoisted(() => ({ db: null as any, status: null as any, role: 'student' }));

vi.mock('@/lib/envServer', () => ({ getIssuerJwkJson: vi.fn() }));
vi.mock('@/lib/supabaseServer', () => ({
  createSupabaseServerClient: async () => h.db.client,
  // service-role client: the same in-memory DB, plus the status-list table and its SQL functions
  createSupabaseAdminClient: async () => ({
    ...h.db.client,
    from: (t: string) => (t === 'vc_status_lists' ? h.status.client.from(t) : h.db.client.from(t)),
    rpc: (fn: string, args: any) => h.status.client.rpc(fn, args),
    auth: { admin: { getUserById: async () => ({ data: { user: { email: 's@campus.test', user_metadata: {} } }, error: null }) } },
  }),
  requireRole: async (allowed: string[]) => {
    const user = h.db.user;
    if (!user) return { user: {}, role: 'student', authorized: false, message: 'Authentication required' };
    return allowed.includes(h.role)
      ? { user, role: h.role, authorized: true }
      : { user, role: h.role, authorized: false, message: 'Access denied' };
  },
}));
vi.mock('@/lib/emailService', () => ({
  emailService: { sendCertificateApproved: async () => true, sendCertificateRejected: async () => true },
}));
vi.mock('@/lib/envValidator', () => ({
  getIssuerDID: () => 'did:web:campussync.test',
  getBaseUrl: () => 'https://campussync.test',
}));

import { getIssuerJwkJson } from '@/lib/envServer';
import { toPublicJwk } from '@/lib/vc';
import { decodeList, getBit, __resetStatusListCursor } from '@/lib/statusList';
import { POST as issuePOST } from '@/app/api/certificates/issue/route';
import { POST as revokePOST } from '@/app/api/vcs/revoke/route';
import { POST as revertPOST } from '@/app/api/certificates/revert-approval/route';
import { GET as statusGET } from '@/app/api/status/revocation/[listId]/route';
import { verifyCredential } from '@/lib/vcVerify';

const DID = 'did:web:campussync.test';
const ORG = uuid(100);
const FACULTY = uuid(1);
const STUDENT = uuid(2);
const CERT = uuid(10);

const req = (url: string, body?: unknown) =>
  new NextRequest(`http://localhost${url}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const cert = (): Row => ({
  id: CERT,
  student_id: STUDENT,
  organization_id: ORG,
  verification_status: 'verified',
  status: 'approved',
  faculty_id: FACULTY,
  title: 'Cloud 101',
  institution: 'MIT',
  date_issued: '2024-05-01',
});

let db: FakeDb;
let statusDb: FakeStatusDb;
let privateJwk: JWK;

function setup(user: string, role: string, extra: Record<string, Row[]> = {}) {
  db = createFakeDb({
    user_roles: [
      { user_id: STUDENT, role: 'student', organization_id: ORG, approval_status: 'approved' },
      { user_id: FACULTY, role: 'faculty', organization_id: ORG, approval_status: 'approved' },
      { user_id: uuid(3), role: 'super_admin', organization_id: null, approval_status: 'approved' },
    ],
    certificates: [cert()],
    verifiable_credentials: [],
    audit_logs: [],
    ...extra,
  });
  db.user = { id: user };
  h.db = db;
  h.role = role;
}

async function issue() {
  setup(STUDENT, 'student');
  const res = await issuePOST(req('/x', { certificateId: CERT }));
  expect(res.status).toBe(201);
  return (await res.json()).data as { id: string; credentialStatus?: any; proof: { jws: string; verificationMethod: string } };
}

beforeEach(async () => {
  const { privateKey } = await generateKeyPair('EdDSA', { extractable: true, crv: 'Ed25519' });
  privateJwk = { ...(await exportJWK(privateKey)), alg: 'EdDSA' };
  vi.mocked(getIssuerJwkJson).mockReturnValue(JSON.stringify(privateJwk));
  statusDb = createFakeStatusDb();
  h.status = statusDb;
  process.env.NEXT_PUBLIC_BASE_URL = 'https://campussync.test';
  process.env.NEXT_PUBLIC_ISSUER_DID = DID;
  process.env.VC_STATUS_LIST_ENABLED = 'true';
  __resetStatusListCursor();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => {
  delete process.env.VC_STATUS_LIST_ENABLED;
  delete process.env.NEXT_PUBLIC_BASE_URL;
  delete process.env.NEXT_PUBLIC_ISSUER_DID;
});

const fetchList = async (id = 'rev-1') => {
  const res = await statusGET(req(`/api/status/revocation/${id}`) as unknown as Request, { params: Promise.resolve({ listId: id }) });
  return res;
};

describe('issuance', () => {
  it('flag ON: the issued credential carries a credentialStatus entry inside the signed payload', async () => {
    const vc = await issue();
    expect(vc.credentialStatus).toMatchObject({
      type: 'BitstringStatusListEntry',
      statusPurpose: 'revocation',
      statusListIndex: '0',
      statusListCredential: 'https://campussync.test/api/status/revocation/rev-1',
    });
    const key = await importJWK(toPublicJwk(privateJwk), 'EdDSA');
    const { payload, protectedHeader } = await jwtVerify(vc.proof.jws, key, { algorithms: ['EdDSA'] });
    expect((payload.vc as any).credentialStatus).toEqual(vc.credentialStatus);
    // the proof's verificationMethod is did#kid of the signing key
    expect(vc.proof.verificationMethod).toBe(`${DID}#${protectedHeader.kid}`);
    // informational columns were written on the stored row
    expect(db.tables.verifiable_credentials[0]).toMatchObject({ status_list_id: 'rev-1', status_list_index: 0 });
    expect(db.tables.verifiable_credentials[0].credential.credentialStatus).toEqual(vc.credentialStatus);
  });

  it('a repeat call reuses the credential and allocates no second slot', async () => {
    await issue();
    const again = await issuePOST(req('/x', { certificateId: CERT }));
    expect(again.status).toBe(200);
    expect(statusDb.lists.get('rev-1')?.nextIndex).toBe(1);
  });

  it('flag OFF: no credentialStatus, and the status storage is never touched', async () => {
    delete process.env.VC_STATUS_LIST_ENABLED;
    const vc = await issue();
    expect(vc).not.toHaveProperty('credentialStatus');
    expect(db.tables.verifiable_credentials[0].credential).not.toHaveProperty('credentialStatus');
    expect(statusDb.calls).toEqual([]);
    const key = await importJWK(toPublicJwk(privateJwk), 'EdDSA');
    const { payload } = await jwtVerify(vc.proof.jws, key);
    expect(payload.vc).not.toHaveProperty('credentialStatus');
    // and the public route is disabled
    expect((await fetchList()).status).toBe(404);
  });

  it('flag ON but migration not applied: issuance still succeeds, without credentialStatus', async () => {
    statusDb.failWith = '42883';
    const vc = await issue();
    expect(vc).not.toHaveProperty('credentialStatus');
    expect(vc.proof.jws).toBeTruthy();
  });
});

describe('revocation', () => {
  it('POST /api/vcs/revoke sets the bit; the public signed list and the verifier both reflect it', async () => {
    const vc = await issue();
    const before = await (await fetchList()).json();
    const key = await importJWK(toPublicJwk(privateJwk), 'EdDSA');
    const beforePayload = (await jwtVerify(before.jws, key, { algorithms: ['EdDSA'] })).payload;
    expect(getBit(decodeList((beforePayload.vc as any).credentialSubject.encodedList), 0)).toBe(false);

    setup(uuid(3), 'super_admin', { verifiable_credentials: db.tables.verifiable_credentials });
    const res = await revokePOST(req('/x', { credentialId: vc.id, reason: 'test' }));
    expect(res.status).toBe(200);
    expect(db.tables.verifiable_credentials[0].status).toBe('revoked');
    expect(getBit(statusDb.lists.get('rev-1')!.bytes, 0)).toBe(true);

    const after = await fetchList();
    expect(after.status).toBe(200);
    expect(after.headers.get('cache-control')).toBe('public, max-age=60');
    const body = await after.json();
    expect(Object.keys(body).sort()).toEqual(['id', 'jws', 'updatedAt']);
    const { payload, protectedHeader } = await jwtVerify(body.jws, key, { algorithms: ['EdDSA'], issuer: DID });
    expect(protectedHeader.kid).toBe(decodeProtectedHeader(vc.proof.jws).kid);
    expect(getBit(decodeList((payload.vc as any).credentialSubject.encodedList), 0)).toBe(true);
    expect(body.id).toBe('https://campussync.test/api/status/revocation/rev-1');
  });

  it('revoke still succeeds when the status storage is unavailable', async () => {
    const vc = await issue();
    statusDb.failWith = '42P01';
    setup(uuid(3), 'super_admin', { verifiable_credentials: db.tables.verifiable_credentials });
    const res = await revokePOST(req('/x', { credentialId: vc.id }));
    expect(res.status).toBe(200);
    expect(db.tables.verifiable_credentials[0].status).toBe('revoked');
  });

  it('revoke accepts the stored urn:uuid id and still rejects non-UUID ids', async () => {
    setup(uuid(3), 'super_admin');
    expect((await revokePOST(req('/x', { credentialId: 'not-a-uuid' }))).status).toBe(400);
    expect((await revokePOST(req('/x', { credentialId: 'urn:uuid:nope' }))).status).toBe(400);
  });

  it('reverting a certificate approval revokes its credentials AND flips their bits', async () => {
    const vc = await issue();
    setup(FACULTY, 'faculty', { verifiable_credentials: db.tables.verifiable_credentials });
    const res = await revertPOST(req('/x', { certificateId: CERT }));
    expect(res.status).toBe(200);
    expect(db.tables.verifiable_credentials[0].status).toBe('revoked');
    expect(getBit(statusDb.lists.get('rev-1')!.bytes, 0)).toBe(true);

    const r = await verifyCredential({ jws: vc.proof.jws }, { supabase: db.client, statusDb: statusDb.client });
    expect(r).toMatchObject({ valid: false, reason: 'revoked' });
  });
});

describe('GET /api/status/revocation/[listId]', () => {
  it('404 for unknown lists and malformed ids; 503 when storage is missing', async () => {
    expect((await fetchList('rev-1')).status).toBe(404); // nothing allocated yet
    expect((await fetchList('../etc/passwd')).status).toBe(404);
    expect((await fetchList('UPPER')).status).toBe(404);
    statusDb.failWith = '42P01';
    expect((await fetchList('rev-1')).status).toBe(503);
  });

  it('serves CORS-readable public data without private key material', async () => {
    await issue();
    const res = await fetchList();
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect(JSON.stringify(await res.json())).not.toContain(privateJwk.d as string);
  });
});
