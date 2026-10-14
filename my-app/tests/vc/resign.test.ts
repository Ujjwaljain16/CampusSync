// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import {
  generateKeyPair,
  exportJWK,
  decodeProtectedHeader,
  decodeJwt,
  SignJWT,
  importJWK,
  errors as joseErrors,
  type JWK,
} from 'jose';
import { createFakeDb, uuid, type FakeDb, type Row } from '../certificates/fakeSupabase';
import { createFakeStatusDb } from './fakeStatusDb';

const h = vi.hoisted(() => ({ db: null as any, audits: [] as Array<{ client: any; entry: any }> }));

vi.mock('@/lib/envServer', () => ({ getIssuerJwkJson: vi.fn() }));
vi.mock('@/lib/supabaseServer', () => ({
  createSupabaseServerClient: async () => h.db.client,
  createSupabaseAdminClient: async () => h.db.adminClient,
}));
vi.mock('@/lib/api/utils/audit', () => ({
  writeAudit: async (client: any, entry: any) => {
    h.audits.push({ client, entry });
    return true;
  },
}));

import { getIssuerJwkJson } from '@/lib/envServer';
import { signCredential, verifyCredentialJws, verifyCredentialJwsWithKeys } from '@/lib/vc';
import { verifyCredential, type StoreClient } from '@/lib/vcVerify';
import { resignAll, resignCredential, getCurrentSigner, type ResignSigner } from '@/lib/vcResign';
import { __resetRateLimitStore } from '@/lib/rateLimit';
import { POST as resignPOST } from '@/app/api/admin/vcs/resign/route';

const ISSUER = 'did:web:campussync.test';
const ADMIN = uuid(1);
const ORG = uuid(100);
const STATUS_ENTRY = {
  id: 'https://campussync.test/api/status/revocation/list-1#7',
  type: 'BitstringStatusListEntry' as const,
  statusPurpose: 'revocation' as const,
  statusListIndex: '7',
  statusListCredential: 'https://campussync.test/api/status/revocation/list-1',
};

let oldPrivate: JWK; // RS256, the "leaked" key
let newPrivate: JWK; // EdDSA, the replacement
let oldPub: JWK;
let newPub: JWK;

const setKey = (jwk: JWK | string) =>
  vi.mocked(getIssuerJwkJson).mockReturnValue(typeof jwk === 'string' ? jwk : JSON.stringify(jwk));

beforeAll(async () => {
  const old = await generateKeyPair('RS256', { extractable: true, modulusLength: 2048 });
  oldPrivate = { ...(await exportJWK(old.privateKey)), alg: 'RS256' };
  const next = await generateKeyPair('EdDSA', { extractable: true, crv: 'Ed25519' });
  newPrivate = { ...(await exportJWK(next.privateKey)), alg: 'EdDSA' };
  setKey(oldPrivate);
  // kid = thumbprint, computed by the same code that signs
  const { getIssuerPublicJwk } = await import('@/lib/vc');
  oldPub = await getIssuerPublicJwk();
  setKey(newPrivate);
  newPub = await getIssuerPublicJwk();
  expect(oldPub.kid).not.toBe(newPub.kid);
});

let seq = 0;
/** Issue a credential with the key currently configured and wrap it as a stored row. */
async function storedRow(key: JWK, over: Row = {}): Promise<Row> {
  setKey(key);
  const n = ++seq;
  const vc = await signCredential({
    issuerDid: ISSUER,
    credentialStatus: STATUS_ENTRY,
    credential: {
      credentialSubject: {
        id: uuid(200 + n),
        certificateId: uuid(300 + n),
        title: `Course ${n}`,
        institution: 'Test University',
        dateIssued: '2025-01-01',
      },
    },
  });
  return {
    id: vc.id,
    student_id: vc.credentialSubject.id,
    certificate_id: vc.credentialSubject.certificateId,
    organization_id: ORG,
    issuer: vc.issuer,
    issuance_date: vc.issuanceDate,
    status: 'active',
    credential: vc,
    ...over,
  };
}

/** The fake has no `.range()`; emulate PostgREST range paging on top of limit(). */
function withRange(client: any) {
  const from = client.from.bind(client);
  client.from = (table: string) => {
    const q: any = from(table);
    q.range = (a: number, b: number) => {
      q.limit(b + 1);
      const then = q.then.bind(q);
      q.then = (ok: any, err: any) =>
        then((r: any) => (Array.isArray(r.data) ? { ...r, data: r.data.slice(a) } : r), err).then(ok, err);
      return q;
    };
    return q;
  };
  return client;
}

let db: FakeDb;
const setup = (rows: Row[], extra: Record<string, Row[]> = {}) => {
  db = createFakeDb({ verifiable_credentials: rows, audit_logs: [], user_roles: [], ...extra });
  db.user = { id: ADMIN };
  withRange(db.adminClient);
  h.db = db;
  h.audits = [];
};
const vcTable = () => db.tables.verifiable_credentials;
const jwsOf = (row: Row) => row.credential.proof.jws as string;

beforeEach(() => {
  __resetRateLimitStore();
  delete process.env.NEXT_PUBLIC_ISSUER_DID;
  delete process.env.VC_ISSUER_PREVIOUS_PUBLIC_JWKS;
  setKey(newPrivate);
});

describe('resignAll', () => {
  it('re-signs credentials made by the old key; they verify with the new key and no longer with the old key alone', async () => {
    const rows = [await storedRow(oldPrivate), await storedRow(oldPrivate)];
    setup(rows);
    setKey(newPrivate);

    const summary = await resignAll(db.adminClient);
    expect(summary).toMatchObject({ scanned: 2, resigned: 2, skipped: 0, failed: [], dryRun: false });

    // status list holding the credentials' bit (index 7), not revoked
    const statusDb = createFakeStatusDb();
    statusDb.lists.set('list-1', { id: 'list-1', purpose: 'revocation', bytes: new Uint8Array(131072 / 8), nextIndex: 8, size: 131072, updatedAt: '2026-01-01T00:00:00.000Z' });

    for (const original of rows) {
      const stored = vcTable().find(r => r.id === original.id)!;
      const jws = jwsOf(stored);
      expect(jws).not.toBe(jwsOf(original));
      expect(decodeProtectedHeader(jws)).toMatchObject({ alg: 'EdDSA', kid: newPub.kid });
      expect(stored.credential.proof.verificationMethod).toBe(`${ISSUER}#${newPub.kid}`);

      // verifies with the new public key
      const ok = await verifyCredentialJws(jws, newPub, { issuer: ISSUER });
      expect(ok.payload.jti).toBe(original.id);
      // the new copy does not verify against the old public key
      await expect(verifyCredentialJwsWithKeys(jws, [oldPub])).rejects.toBeInstanceOf(joseErrors.JWKSNoMatchingKey);
      await expect(verifyCredentialJws(jws, oldPub)).rejects.toBeInstanceOf(joseErrors.JOSEError);

      // the OLD copy no longer verifies once only the new key is trusted
      const store = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: original.id, status: 'active' }, error: null }) }) }) }) } as unknown as StoreClient;
      const oldCopy = await verifyCredential({ jws: jwsOf(original) }, { supabase: store, getPublicJwks: async () => [newPub], issuer: ISSUER });
      expect(oldCopy).toMatchObject({ valid: false, reason: 'unknown_key' });
      // the re-signed copy verifies end to end, looked up by id
      const lookup = {
        from: () => ({
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: { id: stored.id, status: 'active', credential: stored.credential, revoked_at: null, revoked_reason: null }, error: null }) }),
          }),
        }),
      } as unknown as StoreClient;
      const fresh = await verifyCredential({ vcId: stored.id }, { supabase: lookup, statusDb: statusDb.client, getPublicJwks: async () => [newPub], issuer: ISSUER });
      expect(fresh).toMatchObject({ valid: true, status: 'active', credentialId: original.id });
    }
  });

  it('keeps the credential payload, the row identity and the status unchanged', async () => {
    const original = await storedRow(oldPrivate);
    setup([original]);
    setKey(newPrivate);
    await resignAll(db.adminClient);

    const stored = vcTable()[0];
    const { proof: oldProof, ...oldBody } = original.credential;
    const { proof: newProof, ...newBody } = stored.credential;
    expect(newBody).toEqual(oldBody); // id, subject, dates, credentialStatus, issuer: all identical
    expect(newBody.credentialStatus).toEqual(STATUS_ENTRY);
    expect(newProof.created).toBe(oldProof.created);
    expect(newProof.jws).not.toBe(oldProof.jws);

    for (const col of ['id', 'status', 'certificate_id', 'organization_id', 'student_id', 'issuer', 'issuance_date']) {
      expect(stored[col]).toBe(original[col]);
    }
    const payload = decodeJwt(jwsOf(stored));
    expect(payload.jti).toBe(original.id);
    expect(payload.sub).toBe(original.credential.credentialSubject.id);
    expect(payload.exp).toBe(Math.floor(Date.parse(original.credential.expirationDate) / 1000));
    expect((payload.vc as any).credentialStatus).toEqual(STATUS_ENTRY);
  });

  it('writes only the credential column, only through the service-role client, only for active rows', async () => {
    setup([await storedRow(oldPrivate)]);
    setKey(newPrivate);
    await resignAll(db.adminClient);

    expect(db.writes).toHaveLength(1);
    expect(db.writes[0]).toMatchObject({ client: 'admin', op: 'update', table: 'verifiable_credentials' });
    expect(Object.keys(db.writes[0].values!)).toEqual(['credential']);
    expect(db.writes.every(w => w.client === 'admin')).toBe(true);
  });

  it('is idempotent: a second run changes nothing', async () => {
    setup([await storedRow(oldPrivate), await storedRow(newPrivate)]);
    setKey(newPrivate);
    const first = await resignAll(db.adminClient);
    expect(first).toMatchObject({ scanned: 2, resigned: 1, skipped: 1 });

    const snapshot = JSON.stringify(vcTable());
    db.writes.length = 0;
    const second = await resignAll(db.adminClient);
    expect(second).toMatchObject({ scanned: 2, resigned: 0, skipped: 2, failed: [] });
    expect(db.writes).toHaveLength(0);
    expect(JSON.stringify(vcTable())).toBe(snapshot);
  });

  it('leaves revoked rows untouched', async () => {
    const revoked = await storedRow(oldPrivate, { status: 'revoked', revoked_at: '2026-01-01T00:00:00.000Z', revoked_reason: 'x' });
    const active = await storedRow(oldPrivate);
    setup([revoked, active]);
    setKey(newPrivate);

    const summary = await resignAll(db.adminClient);
    expect(summary).toMatchObject({ scanned: 1, resigned: 1 });
    const stored = vcTable().find(r => r.id === revoked.id)!;
    expect(stored).toEqual(revoked);
    expect(jwsOf(stored)).toBe(jwsOf(revoked));
    expect(db.writes.every(w => w.op === 'update')).toBe(true);
    expect(db.writes).toHaveLength(1);
  });

  it('does not touch a credential that is revoked between the read and the write', async () => {
    const row = await storedRow(oldPrivate);
    setup([row]);
    setKey(newPrivate);
    const client: any = db.adminClient;
    const realFrom = client.from;
    client.from = (table: string) => {
      const q = realFrom(table);
      const update = q.update.bind(q);
      q.update = (values: any) => {
        vcTable()[0].status = 'revoked'; // revoked by someone else right before our write
        return update(values);
      };
      return q;
    };
    const summary = await resignAll(client);
    expect(summary).toMatchObject({ resigned: 0, skipped: 1, failed: [] });
    expect(jwsOf(vcTable()[0])).toBe(jwsOf(row));
    expect(vcTable()[0].status).toBe('revoked');
  });

  it('dryRun reports what would change and writes nothing', async () => {
    const rows = [await storedRow(oldPrivate), await storedRow(newPrivate)];
    setup(rows);
    setKey(newPrivate);
    const before = JSON.stringify(vcTable());

    const summary = await resignAll(db.adminClient, { dryRun: true });
    expect(summary).toMatchObject({ scanned: 2, resigned: 1, skipped: 1, failed: [], dryRun: true });
    expect(db.writes).toHaveLength(0);
    expect(JSON.stringify(vcTable())).toBe(before);
  });

  it('one bad row does not stop the others', async () => {
    const good1 = await storedRow(oldPrivate);
    const good2 = await storedRow(oldPrivate);
    const noProof = await storedRow(oldPrivate);
    delete noProof.credential.proof;
    const garbage = await storedRow(oldPrivate);
    garbage.credential.proof.jws = 'not-a-jws';
    const wrongId = await storedRow(oldPrivate);
    wrongId.credential.id = 'urn:uuid:someone-else';
    const nullCredential = await storedRow(oldPrivate, { credential: null });
    setup([good1, noProof, garbage, wrongId, nullCredential, good2]);
    setKey(newPrivate);

    const summary = await resignAll(db.adminClient);
    expect(summary.scanned).toBe(6);
    expect(summary.resigned).toBe(2);
    expect(new Map(summary.failed.map(f => [f.id, f.reason]))).toEqual(
      new Map([
        [noProof.id, 'missing_proof'],
        [garbage.id, 'malformed_proof'],
        [wrongId.id, 'id_mismatch'],
        [nullCredential.id, 'invalid_credential'],
      ])
    );
    for (const ok of [good1, good2]) {
      const stored = vcTable().find(r => r.id === ok.id)!;
      expect(decodeProtectedHeader(jwsOf(stored)).kid).toBe(newPub.kid);
    }
    // failed rows are left exactly as they were
    expect(jwsOf(vcTable().find(r => r.id === garbage.id)!)).toBe('not-a-jws');
  });

  it('a signing failure or a write failure on one row is recorded and the run continues', async () => {
    const a = await storedRow(oldPrivate);
    const b = await storedRow(oldPrivate);
    const c = await storedRow(oldPrivate);
    setup([a, b, c]);
    setKey(newPrivate);
    const real = await getCurrentSigner();
    const signer: ResignSigner = {
      ...real,
      sign: async (vc, opts) => {
        if (opts.jti === b.id) throw new Error('boom: secret-looking detail');
        return real.sign(vc, opts);
      },
    };
    const summary = await resignAll(db.adminClient, { signer });
    expect(summary).toMatchObject({ scanned: 3, resigned: 2, failed: [{ id: b.id, reason: 'signing_failed' }] });
    expect(JSON.stringify(summary)).not.toContain('boom');

    setup([a, c]);
    db.errors['update:verifiable_credentials'] = { message: 'db down', code: '57P01' };
    const failedWrites = await resignAll(db.adminClient, { signer: real });
    expect(failedWrites.resigned).toBe(0);
    expect(failedWrites.failed.map(f => f.reason)).toEqual(['write_failed', 'write_failed']);
    expect(JSON.stringify(failedWrites)).not.toContain('db down');
  });

  it('respects limit and reports limitReached; repeated runs finish the job', async () => {
    const rows = [await storedRow(oldPrivate), await storedRow(oldPrivate), await storedRow(oldPrivate)];
    setup(rows);
    setKey(newPrivate);

    const first = await resignAll(db.adminClient, { limit: 2 });
    expect(first).toMatchObject({ resigned: 2, limitReached: true });
    const second = await resignAll(db.adminClient, { limit: 2 });
    expect(second).toMatchObject({ resigned: 1, limitReached: false });
    expect(vcTable().every(r => decodeProtectedHeader(jwsOf(r)).kid === newPub.kid)).toBe(true);
  });

  it('re-signs legacy credentials whose token has no kid, and skips expired ones', async () => {
    // legacy: signed by the old key without a kid header, no verificationMethod pointing at a kid
    setKey(oldPrivate);
    const base = await storedRow(oldPrivate);
    const key = await importJWK(oldPrivate, 'RS256');
    const { proof: _p, ...body } = base.credential;
    void _p;
    const legacyJws = await new SignJWT({ vc: body }).setProtectedHeader({ alg: 'RS256' }).setIssuer(ISSUER).setJti(base.id).sign(key);
    const legacy: Row = { ...base, credential: { ...body, proof: { type: 'JsonWebSignature2020', created: body.issuanceDate, proofPurpose: 'assertionMethod', verificationMethod: `${ISSUER}#keys-1`, jws: legacyJws } } };
    const expired = await storedRow(oldPrivate);
    expired.credential.expirationDate = '2020-01-01T00:00:00.000Z';
    setup([legacy, expired]);
    setKey(newPrivate);

    const summary = await resignAll(db.adminClient);
    expect(summary).toMatchObject({ scanned: 2, resigned: 1, skipped: 1, failed: [] });
    const stored = vcTable().find(r => r.id === legacy.id)!;
    expect(decodeProtectedHeader(jwsOf(stored)).kid).toBe(newPub.kid);
    expect(stored.credential.proof.verificationMethod).toBe(`${ISSUER}#${newPub.kid}`);
    expect(jwsOf(vcTable().find(r => r.id === expired.id)!)).toBe(jwsOf(expired));
  });

  it('never stores a signature that does not verify against the current public key', async () => {
    const row = await storedRow(oldPrivate);
    setKey(newPrivate);
    const real = await getCurrentSigner();
    const wrongKey = await generateKeyPair('EdDSA', { extractable: true, crv: 'Ed25519' });
    const rogue: ResignSigner = {
      ...real,
      sign: async (vc, opts) => {
        const jws = await new SignJWT({ vc }).setProtectedHeader({ alg: 'EdDSA', kid: real.kid }).setIssuer(opts.issuerDid).setJti(opts.jti!).sign(wrongKey.privateKey);
        return { jws, kid: real.kid };
      },
    };
    const out = await resignCredential({ id: row.id, credential: row.credential }, { signer: rogue });
    expect(out).toEqual({ outcome: 'failed', reason: 'signing_failed' });
  });

  it('getCurrentSigner refuses a placeholder key', async () => {
    setKey({ kty: 'RSA', n: 'placeholder-n-value-for-development', e: 'AQAB', alg: 'RS256' });
    await expect(getCurrentSigner()).rejects.toThrow();
  });
});

describe('POST /api/admin/vcs/resign', () => {
  const asSuperAdmin = (rows: Row[]) => {
    setup(rows, { user_roles: [{ user_id: ADMIN, role: 'super_admin', organization_id: null, approval_status: 'approved' }] });
  };
  const post = async (body?: unknown, raw?: string) => {
    const res = await resignPOST(
      new NextRequest('http://localhost/api/admin/vcs/resign', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: raw ?? (body === undefined ? undefined : JSON.stringify(body)),
      })
    );
    return { status: res.status, body: await res.json() };
  };

  it('refuses callers who are not super admins (403) and unauthenticated callers (401)', async () => {
    const row = await storedRow(oldPrivate);
    setKey(newPrivate);
    for (const role of ['admin', 'org_admin', 'faculty', 'student']) {
      setup([row], { user_roles: [{ user_id: ADMIN, role, organization_id: ORG, approval_status: 'approved' }] });
      const res = await post({});
      expect(res.status).toBe(403);
    }
    // a super_admin row that is not approved does not count
    setup([row], { user_roles: [{ user_id: ADMIN, role: 'super_admin', organization_id: null, approval_status: 'pending' }] });
    expect((await post({})).status).toBe(403);
    setup([row]);
    db.user = null;
    expect((await post({})).status).toBe(401);
    expect(db.writes).toHaveLength(0);
    expect(h.audits).toHaveLength(0);
    expect(jwsOf(vcTable()[0])).toBe(jwsOf(row));
  });

  it('re-signs for a super admin, returns the counts and writes exactly one audit row with counts only', async () => {
    const rows = [await storedRow(oldPrivate), await storedRow(oldPrivate), await storedRow(newPrivate)];
    asSuperAdmin(rows);
    setKey(newPrivate);

    const res = await post({ dryRun: false });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ scanned: 3, resigned: 2, skipped: 1, failed: [], dryRun: false });
    expect(vcTable().every(r => decodeProtectedHeader(jwsOf(r)).kid === newPub.kid)).toBe(true);
    expect(db.writes.every(w => w.client === 'admin')).toBe(true);

    expect(h.audits).toHaveLength(1);
    const { entry } = h.audits[0];
    expect(entry).toMatchObject({ actorId: ADMIN, action: 'vc_resign', targetType: 'system' });
    expect(entry.details).toEqual({ dryRun: false, limit: 200, scanned: 3, resigned: 2, skipped: 1, failed: 0, limitReached: false });
    const serialized = JSON.stringify(entry) + JSON.stringify(res.body);
    for (const secret of [(newPrivate as any).d, (oldPrivate as any).d, (oldPrivate as any).p, (oldPrivate as any).q]) {
      expect(serialized).not.toContain(secret);
    }
    expect(serialized).not.toContain('eyJ'); // no tokens either
  });

  it('dryRun through the route writes no credential and still records one audit row', async () => {
    const row = await storedRow(oldPrivate);
    asSuperAdmin([row]);
    setKey(newPrivate);
    const res = await post({ dryRun: true, limit: 10 });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ scanned: 1, resigned: 1, dryRun: true });
    expect(db.writes).toHaveLength(0);
    expect(jwsOf(vcTable()[0])).toBe(jwsOf(row));
    expect(h.audits).toHaveLength(1);
    expect(h.audits[0].entry.details).toMatchObject({ dryRun: true, limit: 10, resigned: 1 });
  });

  it('answers 409 with a clear message when the current key is missing or a placeholder', async () => {
    asSuperAdmin([await storedRow(oldPrivate)]);
    for (const value of ['', '{}', 'not json', JSON.stringify({ kty: 'RSA', n: 'placeholder-n-value-for-development', e: 'AQAB', alg: 'RS256' })]) {
      setKey(value);
      __resetRateLimitStore();
      const res = await post({});
      expect(res.status).toBe(409);
      expect(res.body.error).toMatch(/VC_ISSUER_JWK/);
    }
    expect(db.writes).toHaveLength(0);
    expect(h.audits).toHaveLength(0);
  });

  it('validates the body', async () => {
    asSuperAdmin([]);
    setKey(newPrivate);
    const call = async (body?: unknown, raw?: string) => {
      __resetRateLimitStore();
      return (await post(body, raw)).status;
    };
    expect(await call({ dryRun: 'yes' })).toBe(400);
    expect(await call({ limit: 0 })).toBe(400);
    expect(await call({ limit: 1.5 })).toBe(400);
    expect(await call({ limit: 100000 })).toBe(400);
    expect(await call(undefined, '[1]')).toBe(400);
    expect(await call(undefined, '{bad')).toBe(400);
    expect(await call(undefined, '')).toBe(200); // empty body = defaults
  });

  it('is rate limited', async () => {
    asSuperAdmin([]);
    setKey(newPrivate);
    const statuses: number[] = [];
    for (let i = 0; i < 7; i++) statuses.push((await post({})).status);
    expect(statuses.slice(0, 5)).toEqual([200, 200, 200, 200, 200]);
    expect(statuses[6]).toBe(429);
  });
});
