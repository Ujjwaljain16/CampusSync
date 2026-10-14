// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { createFakeDb, uuid, type FakeDb, type Row } from '../certificates/fakeSupabase';
import { credentialIdCandidates, isInvalidInputSyntax } from '@/lib/vcId';

const h = vi.hoisted(() => ({ db: null as any, role: 'super_admin' }));

vi.mock('@/lib/supabaseServer', () => ({
  createSupabaseServerClient: async () => h.db.client,
  createSupabaseAdminClient: async () => h.db.client,
  requireRole: async (allowed: string[]) => {
    const user = h.db.user;
    if (!user) return { user: {}, role: 'student', authorized: false, message: 'Authentication required' };
    return allowed.includes(h.role)
      ? { user, role: h.role, authorized: true }
      : { user, role: h.role, authorized: false, message: 'Access denied' };
  },
}));

import { POST as revokePOST } from '@/app/api/vcs/revoke/route';

const ADMIN = uuid(1);
const STUDENT = uuid(2);
const CERT = uuid(10);
const BARE = uuid(20);
const STORED_ID = `urn:uuid:${BARE}`; // exactly what certificates/issue writes

const vcRow = (over: Row = {}): Row => ({
  id: STORED_ID,
  student_id: STUDENT,
  status: 'active',
  credential: { id: STORED_ID, credentialSubject: { id: STUDENT, certificateId: CERT } },
  ...over,
});

let db: FakeDb;
const setup = (vcs: Row[]) => {
  db = createFakeDb({ verifiable_credentials: vcs, audit_logs: [], certificates: [], user_roles: [] });
  db.user = { id: ADMIN };
  h.db = db;
  h.role = 'super_admin';
};

const post = async (body: unknown) => {
  const res = await revokePOST(
    new NextRequest('http://localhost/api/vcs/revoke', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    undefined as any
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
