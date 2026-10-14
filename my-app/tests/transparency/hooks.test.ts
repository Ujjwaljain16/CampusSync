// @vitest-environment node
import { describe, it, expect, afterEach, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

vi.mock('@/lib/transparencyLog', () => ({ appendEventSafely: vi.fn(), appendEventsSafely: vi.fn() }));
vi.mock('@/lib/vc', () => ({ signCredential: vi.fn() }));
vi.mock('@/lib/envValidator', () => ({ getIssuerDID: () => 'did:web:test.example', getBaseUrl: () => 'http://localhost' }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), log: vi.fn(), debug: vi.fn() } }));

import { appendEventSafely, appendEventsSafely } from '@/lib/transparencyLog';
import { signCredential } from '@/lib/vc';
import { issueCredentialForCertificate, revokeAllCredentialsForCertificate } from '@/lib/services/certificateService';

afterEach(() => vi.unstubAllEnvs());

const CERT = {
  id: 'cert-1',
  student_id: 'student-1',
  organization_id: 'org-1',
  verification_status: 'verified',
  title: 'T',
  institution: 'I',
  date_issued: '2026-01-01',
};
const ACTOR = { id: 'student-1', roles: [] };

/** Chainable fake for exactly the calls issueCredentialForCertificate / revokeAll make. */
function fakeDb(opts: { activeRows?: Array<Record<string, unknown>>; revokedIds?: string[] } = {}) {
  const inserted: Array<Record<string, unknown>> = [];
  const builder = (table: string) => {
    const b: Record<string, unknown> = {};
    const self = () => b;
    b.select = self;
    b.eq = self;
    b.contains = self;
    b.order = self;
    b.update = self;
    b.maybeSingle = async () => ({ data: table === 'certificates' ? CERT : null, error: null });
    b.insert = async (row: Record<string, unknown>) => {
      if (table === 'verifiable_credentials') inserted.push(row);
      return { error: null };
    };
    b.then = (resolve: (v: unknown) => unknown) => {
      if (table === 'verifiable_credentials') {
        if (opts.revokedIds) return resolve({ data: opts.revokedIds.map((id) => ({ id })), error: null });
        const rows = opts.activeRows ?? inserted.map((r) => ({ id: r.id, credential: r.credential, created_at: r.created_at }));
        return resolve({ data: rows, error: null });
      }
      return resolve({ data: [], error: null });
    };
    return b;
  };
  return { from: builder } as unknown as SupabaseClient;
}

const signed = { id: 'urn:uuid:11111111-1111-4111-8111-111111111111', issuer: 'did:web:test.example', issuanceDate: '2026-10-14T00:00:00.000Z' };

describe('issue hook', () => {
  it('does not call the log when the flag is off', async () => {
    vi.mocked(signCredential).mockResolvedValue(signed as never);
    const db = fakeDb();
    const res = await issueCredentialForCertificate(db, { certificateId: 'cert-1', actor: ACTOR, writeDb: db });
    expect(res.ok).toBe(true);
    expect(appendEventSafely).not.toHaveBeenCalled();
  });

  it('appends credential.issued with the raw student id (hashed inside the log layer) when enabled', async () => {
    vi.stubEnv('TRANSPARENCY_LOG_ENABLED', 'true');
    vi.mocked(signCredential).mockResolvedValue(signed as never);
    const db = fakeDb();
    const res = await issueCredentialForCertificate(db, { certificateId: 'cert-1', actor: ACTOR, writeDb: db });
    expect(res).toMatchObject({ ok: true, reused: false });
    expect(appendEventSafely).toHaveBeenCalledTimes(1);
    expect(appendEventSafely).toHaveBeenCalledWith({
      type: 'credential.issued',
      credentialId: signed.id,
      certificateId: 'cert-1',
      organizationId: 'org-1',
      studentId: 'student-1',
    });
  });

  it('issuance still succeeds when the log layer throws', async () => {
    vi.stubEnv('TRANSPARENCY_LOG_ENABLED', 'true');
    vi.mocked(signCredential).mockResolvedValue(signed as never);
    vi.mocked(appendEventSafely).mockRejectedValue(new Error('boom'));
    const db = fakeDb();
    const res = await issueCredentialForCertificate(db, { certificateId: 'cert-1', actor: ACTOR, writeDb: db });
    expect(res.ok).toBe(true);
  });

  it('an idempotent re-issue (existing active credential) logs nothing new', async () => {
    vi.stubEnv('TRANSPARENCY_LOG_ENABLED', 'true');
    const db = fakeDb({ activeRows: [{ id: 'existing', credential: { id: 'existing' }, created_at: 'x' }] });
    const res = await issueCredentialForCertificate(db, { certificateId: 'cert-1', actor: ACTOR, writeDb: db });
    expect(res).toMatchObject({ ok: true, reused: true });
    expect(appendEventSafely).not.toHaveBeenCalled();
  });
});

describe('revoke hook', () => {
  it('logs one credential.revoked event per revoked credential when enabled', async () => {
    vi.stubEnv('TRANSPARENCY_LOG_ENABLED', 'true');
    const res = await revokeAllCredentialsForCertificate(fakeDb({ revokedIds: ['c1', 'c2'] }), 'cert-1');
    expect(res).toMatchObject({ ok: true, count: 2 });
    expect(appendEventsSafely).toHaveBeenCalledWith([
      { type: 'credential.revoked', credentialId: 'c1', certificateId: 'cert-1' },
      { type: 'credential.revoked', credentialId: 'c2', certificateId: 'cert-1' },
    ]);
  });

  it('is silent when the flag is off or nothing was revoked, and never breaks revocation', async () => {
    await revokeAllCredentialsForCertificate(fakeDb({ revokedIds: ['c1'] }), 'cert-1');
    expect(appendEventsSafely).not.toHaveBeenCalled();

    vi.stubEnv('TRANSPARENCY_LOG_ENABLED', 'true');
    await revokeAllCredentialsForCertificate(fakeDb({ revokedIds: [] }), 'cert-1');
    expect(appendEventsSafely).not.toHaveBeenCalled();

    vi.mocked(appendEventsSafely).mockRejectedValue(new Error('boom'));
    const res = await revokeAllCredentialsForCertificate(fakeDb({ revokedIds: ['c9'] }), 'cert-1');
    expect(res).toMatchObject({ ok: true, count: 1, ids: ['c9'] });
  });
});
