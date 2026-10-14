// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { createFakeDb, uuid, type FakeDb, type Row } from '../certificates/fakeSupabase';
import { credentialIdCandidates, isInvalidInputSyntax } from '@/lib/vcId';

const h = vi.hoisted(() => ({ db: null as any, role: 'super_admin', audits: [] as Array<{ client: any; entry: any }> }));

vi.mock('@/lib/supabaseServer', () => ({
  createSupabaseServerClient: async () => h.db.client,
  createSupabaseAdminClient: async () => h.db.adminClient,
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

import { POST as revokePOST } from '@/app/api/vcs/revoke/route';

const ADMIN = uuid(1);
const STUDENT = uuid(2);
const CERT = uuid(10);
const BARE = uuid(20);
const STORED_ID = `urn:uuid:${BARE}`; // exactly what certificates/issue writes
const ORG = uuid(100);
const OTHER_ORG = uuid(101);

const vcRow = (over: Row = {}): Row => ({
  id: STORED_ID,
  student_id: STUDENT,
  status: 'active',
  certificate_id: CERT,
  organization_id: ORG,
  credential: { id: STORED_ID, credentialSubject: { id: STUDENT, certificateId: CERT } },
  ...over,
});

let db: FakeDb;
const setup = (vcs: Row[], extra: Record<string, Row[]> = {}) => {
  db = createFakeDb({ verifiable_credentials: vcs, audit_logs: [], certificates: [], user_roles: [], ...extra });
  db.user = { id: ADMIN };
  h.db = db;
  h.role = 'super_admin';
  h.audits = [];
};

const post = async (body: unknown) => {
  const res = await revokePOST(
    new NextRequest('http://localhost/api/vcs/revoke', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  );
  return { status: res.status, body: await res.json() };
};

beforeEach(() => setup([vcRow()]));

describe('credentialIdCandidates', () => {
  it('accepts the stored urn form and the bare uuid, lowercased, urn first', () => {
    expect(credentialIdCandidates(`urn:uuid:${BARE}`)).toEqual([`urn:uuid:${BARE}`, BARE]);
    expect(credentialIdCandidates(BARE.toUpperCase())).toEqual([`urn:uuid:${BARE}`, BARE]);
    expect(credentialIdCandidates(`  ${BARE}  `)).toEqual([`urn:uuid:${BARE}`, BARE]);
  });

  it('rejects anything that is not a credential id', () => {
    for (const bad of ['', 'abc', `${BARE}x`, `urn:uuid:${BARE}/../x`, `urn:foo:${BARE}`, "' or 1=1 --", null, undefined, 5, {}]) {
      expect(credentialIdCandidates(bad)).toEqual([]);
    }
  });

  it('recognises postgres invalid-input-syntax errors', () => {
    expect(isInvalidInputSyntax({ code: '22P02' })).toBe(true);
    expect(isInvalidInputSyntax({ code: '42703' })).toBe(false);
    expect(isInvalidInputSyntax(null)).toBe(false);
  });
});

describe('POST /api/vcs/revoke', () => {
  it('revokes a credential addressed by its stored urn:uuid id', async () => {
    const { status, body } = await post({ credentialId: STORED_ID, reason: 'issued in error' });
    expect(status).toBe(200);
    expect(body.data.status).toBe('revoked');
    expect(body.data.credentialId).toBe(STORED_ID); // the id exactly as stored
    expect(db.tables.verifiable_credentials[0].status).toBe('revoked');
  });

  it('also finds the credential from the bare uuid', async () => {
    const { status, body } = await post({ credentialId: BARE });
    expect(status).toBe(200);
    expect(body.data.credentialId).toBe(STORED_ID);
    expect(db.tables.verifiable_credentials[0].status).toBe('revoked');
  });

  it('is idempotent for an already revoked credential', async () => {
    setup([vcRow({ status: 'revoked' })]);
    const { status, body } = await post({ credentialId: STORED_ID });
    expect(status).toBe(200);
    expect(body.data.alreadyRevoked).toBe(true);
  });

  it('returns 404 for an unknown credential and 400 for a malformed id', async () => {
    expect((await post({ credentialId: `urn:uuid:${uuid(99)}` })).status).toBe(404);
    expect((await post({ credentialId: 'not-an-id' })).status).toBe(400);
    expect(db.tables.verifiable_credentials[0].status).toBe('active');
  });

  it('rejects an overlong reason without revoking', async () => {
    const { status } = await post({ credentialId: STORED_ID, reason: 'x'.repeat(501) });
    expect(status).toBe(400);
    expect(db.tables.verifiable_credentials[0].status).toBe('active');
  });

  it('refuses callers without a reviewer role', async () => {
    h.role = 'student';
    const { status } = await post({ credentialId: STORED_ID });
    expect([401, 403]).toContain(status);
    expect(db.tables.verifiable_credentials[0].status).toBe('active');
  });
});

describe('POST /api/vcs/revoke: backend write, canonical audit, certificate_id scoping', () => {
  const asFaculty = (vcs: Row[], extra: Record<string, Row[]> = {}) => {
    setup(vcs, {
      user_roles: [{ user_id: ADMIN, role: 'faculty', organization_id: ORG, approval_status: 'approved' }],
      ...extra,
    });
    h.role = 'faculty';
  };

  it('updates the credential with the service-role client only', async () => {
    const { status } = await post({ credentialId: STORED_ID, reason: 'oops' });
    expect(status).toBe(200);
    const writes = db.writes.filter(w => w.table === 'verifiable_credentials');
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({ op: 'update', client: 'admin' });
    expect(writes[0].values).toMatchObject({ status: 'revoked', revoked_reason: 'oops' });
  });

  it('audits through writeAudit with the canonical shape and no entity_type columns', async () => {
    await post({ credentialId: STORED_ID, reason: 'oops' });
    expect(h.audits).toHaveLength(1);
    expect(h.audits[0].entry).toEqual({
      actorId: ADMIN,
      organizationId: ORG,
      action: 'revoke_vc',
      targetType: 'credential',
      targetId: STORED_ID,
      details: { reason: 'oops' },
    });
    expect(db.writes.filter(w => w.table === 'audit_logs')).toEqual([]); // no direct audit_logs insert
  });

  it('scopes a reviewer by the credential organization_id (no certificate lookup needed)', async () => {
    asFaculty([vcRow()]);
    const { status } = await post({ credentialId: STORED_ID });
    expect(status).toBe(200);
    expect(db.log).not.toContain('select:certificates');
    expect(h.audits[0].entry.organizationId).toBe(ORG);
  });

  it('refuses a reviewer of another organization (by the credential organization_id) and writes nothing', async () => {
    asFaculty([vcRow({ organization_id: OTHER_ORG })]);
    const { status } = await post({ credentialId: STORED_ID });
    expect(status).toBe(403);
    expect(db.writes.filter(w => w.table === 'verifiable_credentials')).toEqual([]);
    expect(h.audits).toEqual([]);
    expect(db.tables.verifiable_credentials[0].status).toBe('active');
  });

  it('falls back to the organization of the certificate_id certificate when the row has none', async () => {
    asFaculty([vcRow({ organization_id: null })], { certificates: [{ id: CERT, organization_id: ORG }] });
    const ok = await post({ credentialId: STORED_ID });
    expect(ok.status).toBe(200);
    expect(h.audits[0].entry.organizationId).toBe(ORG);

    asFaculty([vcRow({ organization_id: null })], { certificates: [{ id: CERT, organization_id: OTHER_ORG }] });
    expect((await post({ credentialId: STORED_ID })).status).toBe(403);
    expect(db.tables.verifiable_credentials[0].status).toBe('active');
  });

  it('does not trust the signed JSON for scoping: no certificate_id and no organization_id is refused', async () => {
    asFaculty([vcRow({ organization_id: null, certificate_id: null })], { certificates: [{ id: CERT, organization_id: ORG }] });
    expect((await post({ credentialId: STORED_ID })).status).toBe(403);
  });
});
