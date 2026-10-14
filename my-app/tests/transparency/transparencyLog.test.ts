// @vitest-environment node
import { describe, it, expect, beforeAll, afterEach, beforeEach, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { generateKeyPair, exportJWK, CompactSign, type JWK } from 'jose';
import type { SupabaseClient } from '@supabase/supabase-js';
import { FakeDb } from './fakeDb';
import { MerkleTree, fromHex, toHex, verifyInclusion, verifyConsistency } from '@/lib/merkle';
import {
  TREE_HEAD_JWS_TYP,
  canonicalJson,
  verifyConsistencyProofResponse,
  verifyInclusionProofResponse,
  verifyTreeHeadSignature,
  decodeJwsPayload,
  type Jwks,
} from '@/lib/tlogVerify';
import { signPayload, verifySignedPayload } from '@/lib/signing';
import {
  TlogError,
  __resetTlogCaches,
  appendEvent,
  appendEventSafely,
  appendEventsSafely,
  ensureTreeHead,
  findEntriesByCredential,
  getConsistencyProof,
  getInclusionProof,
  getLatestTreeHead,
  hashStudentId,
  isUndefinedTableError,
  listEntries,
  validateEvent,
  type TlogEvent,
} from '@/lib/transparencyLog';

vi.mock('@/lib/supabaseServer', () => ({ createSupabaseAdminClient: vi.fn() }));
vi.mock('@/lib/signing', async (orig) => {
  const actual = await orig<typeof import('@/lib/signing')>();
  return { ...actual, signPayload: vi.fn(actual.signPayload) };
});
import { createSupabaseAdminClient } from '@/lib/supabaseServer';

const SALT = 'unit-test-salt-0123456789abcdef';
let jwks: Jwks;

beforeAll(async () => {
  // Throw-away key generated for this test run; never printed or written anywhere.
  const { privateKey, publicKey } = await generateKeyPair('ES256', { extractable: true });
  const priv = { ...(await exportJWK(privateKey)), alg: 'ES256', use: 'sig', kid: 'test-key-1' } as JWK;
  const pub = { ...(await exportJWK(publicKey)), alg: 'ES256', use: 'sig', kid: 'test-key-1' } as JWK;
  process.env.VC_ISSUER_JWK = JSON.stringify(priv);
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role';
  jwks = { keys: [pub] };
});

beforeEach(() => {
  __resetTlogCaches();
  vi.stubEnv('TRANSPARENCY_LOG_SALT', SALT);
  vi.stubEnv('TRANSPARENCY_LOG_ID', 'test-log');
});
afterEach(() => {
  vi.unstubAllEnvs();
});

const asClient = (db: FakeDb) => db as unknown as SupabaseClient;
const STUDENT_ID = '11111111-2222-3333-4444-555555555555';
const mkEvent = (i: number, type: TlogEvent['type'] = 'credential.issued'): TlogEvent => ({
  type,
  credentialId: `urn:uuid:00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
  certificateId: `cert-${i}`,
  organizationId: 'org-1',
  studentHash: hashStudentId(`student-${i}`),
  at: new Date(Date.UTC(2026, 9, 14, 12, 0, i)).toISOString(),
});

async function fill(db: FakeDb, n: number) {
  for (let i = 0; i < n; i++) await appendEvent(asClient(db), mkEvent(i));
}

describe('canonical JSON and student pseudonym', () => {
  it('sorts keys, drops undefined, is whitespace free and stable', () => {
    expect(canonicalJson({ b: 1, a: { d: 'x', c: [3, { z: 1, y: undefined }] } })).toBe('{"a":{"c":[3,{"z":1}],"d":"x"},"b":1}');
    expect(canonicalJson({ a: 1, b: 2 })).toBe(canonicalJson({ b: 2, a: 1 }));
    expect(() => canonicalJson({ a: Number.NaN })).toThrow();
    expect(() => canonicalJson({ a: () => 1 })).toThrow();
  });

  it('hashStudentId is a keyed hash: deterministic, salt dependent, never the raw id, requires a real salt', () => {
    const h = hashStudentId(STUDENT_ID);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).toBe(hashStudentId(STUDENT_ID));
    expect(h).not.toContain(STUDENT_ID);
    expect(h).not.toBe(createHash('sha256').update(STUDENT_ID).digest('hex')); // not a bare unsalted hash
    expect(hashStudentId(STUDENT_ID, 'another-salt-0123456789abcdef')).not.toBe(h);
    expect(() => hashStudentId(STUDENT_ID, '')).toThrow(/SALT/);
    expect(() => hashStudentId(STUDENT_ID, 'short')).toThrow(TlogError);
    vi.stubEnv('TRANSPARENCY_LOG_SALT', '');
    expect(() => hashStudentId(STUDENT_ID)).toThrow(TlogError);
  });

  it('validateEvent rejects malformed events and drops unknown fields (no PII can ride along)', () => {
    const ok = mkEvent(1);
    expect(validateEvent(ok)).toEqual(ok);
    expect(() => validateEvent({ ...ok, type: 'credential.deleted' as never })).toThrow(TlogError);
    expect(() => validateEvent({ ...ok, credentialId: '' })).toThrow(TlogError);
    expect(() => validateEvent({ ...ok, credentialId: 'has space' })).toThrow(TlogError);
    expect(() => validateEvent({ ...ok, studentHash: STUDENT_ID })).toThrow(TlogError);
    expect(() => validateEvent({ ...ok, at: '2026-10-14' })).toThrow(TlogError);
    expect(() => validateEvent({ ...ok, at: '2026-13-99T99:99:99Z' })).toThrow(TlogError);
    const sneaky = { ...ok, email: 'a@b.c', studentId: STUDENT_ID, name: 'Alice' } as unknown as TlogEvent;
    const cleaned = validateEvent(sneaky);
    expect(JSON.stringify(cleaned)).not.toMatch(/a@b\.c|Alice|studentId/);
    expect(STUDENT_ID).not.toBe(cleaned.studentHash);
  });

  it('classifies undefined-table style errors', () => {
    for (const code of ['42P01', 'PGRST205', 'PGRST204', '42883', 'PGRST202']) expect(isUndefinedTableError({ code })).toBe(true);
    for (const code of ['23505', '42501', 'PGRST116']) expect(isUndefinedTableError({ code })).toBe(false);
    expect(isUndefinedTableError(null)).toBe(false);
  });
});

describe('signing', () => {
  it('signPayload round-trips with typ binding and the issuer public key', async () => {
    const jws = await signPayload({ b: 2, a: 1 }, { typ: 'application/x-test' });
    expect(await verifySignedPayload(jws, { typ: 'application/x-test' })).toEqual({ a: 1, b: 2 });
    await expect(verifySignedPayload(jws, { typ: 'application/other' })).rejects.toThrow();
    const [h, p, s] = jws.split('.');
    const tampered = `${h}.${Buffer.from('{"a":9}').toString('base64url')}.${s}`;
    await expect(verifySignedPayload(tampered, { typ: 'application/x-test' })).rejects.toThrow();
    expect(p.length).toBeGreaterThan(0);
  });
});

describe('appendEvent and signed tree heads', () => {
  it('assigns contiguous indexes, stores a canonical leaf, and publishes a verifiable signed head after each append', async () => {
    const db = new FakeDb();
    const heads = [];
    for (let i = 0; i < 6; i++) {
      const res = await appendEvent(asClient(db), mkEvent(i));
      expect(res.index).toBe(i);
      expect(res.treeHead?.treeSize).toBe(i + 1);
      heads.push(res.treeHead!);
    }
    // stored rows: leaf hash == SHA256(0x00 || canonical JSON) and no raw student data
    for (const row of db.tables.tlog_entries) {
      const canonical = canonicalJson(row.entry);
      const expected = createHash('sha256').update(Buffer.concat([Buffer.from([0]), Buffer.from(canonical)])).digest('hex');
      expect(row.leaf_hash).toBe(expected);
    }
    expect(JSON.stringify(db.tables.tlog_entries)).not.toMatch(/student-\d|@/);

    // each head: root == independent root of stored leaves, signature verifies, payload decodes
    for (const h of heads) {
      const tree = new MerkleTree(db.tables.tlog_entries.slice(0, h.treeSize).map((r) => fromHex(r.leaf_hash as string)));
      expect(h.rootHash).toBe(toHex(tree.root()));
      expect((await verifyTreeHeadSignature(h, jwks)).status).toBe('pass');
      expect(decodeJwsPayload(h.jws)).toMatchObject({ treeSize: h.treeSize, rootHash: h.rootHash, logId: 'test-log' });
    }
    expect(db.tables.tlog_tree_heads).toHaveLength(6);
  });

  it('refreshing a head reads only the entries newer than the previous head (frontier), not the whole log', async () => {
    const db = new FakeDb();
    await fill(db, 40);
    db.leafRangeReads = [];
    // Append WITHOUT publishing, then publish once: must read only the 5 new leaves.
    for (let i = 40; i < 45; i++) await appendEvent(asClient(db), mkEvent(i), { publishHead: false });
    db.leafRangeReads = [];
    const head = await ensureTreeHead(asClient(db));
    expect(head?.treeSize).toBe(45);
    expect(db.leafRangeReads).toEqual([[40, 45]]);
    const tree = new MerkleTree(db.tables.tlog_entries.map((r) => fromHex(r.leaf_hash as string)));
    expect(head?.rootHash).toBe(toHex(tree.root()));
    // idempotent when nothing changed
    db.leafRangeReads = [];
    const again = await ensureTreeHead(asClient(db));
    expect(again?.jws).toBe(head?.jws);
    expect(db.leafRangeReads).toEqual([]);
  });

  it('empty log has no head', async () => {
    const db = new FakeDb();
    expect(await ensureTreeHead(asClient(db))).toBeNull();
    expect(await getLatestTreeHead(asClient(db))).toBeNull();
  });

  it('concurrent appends get unique gap-free indexes and a consistent final head', async () => {
    const db = new FakeDb();
    const results = await Promise.all(Array.from({ length: 25 }, (_, i) => appendEvent(asClient(db), mkEvent(i))));
    const idx = results.map((r) => r.index).sort((a, b) => a - b);
    expect(idx).toEqual(Array.from({ length: 25 }, (_, i) => i));
    const head = await ensureTreeHead(asClient(db));
    expect(head?.treeSize).toBe(25);
    const tree = new MerkleTree(db.tables.tlog_entries.sort((a, b) => (a.leaf_index as number) - (b.leaf_index as number)).map((r) => fromHex(r.leaf_hash as string)));
    expect(head?.rootHash).toBe(toHex(tree.root()));
    // every stored head (some sizes may have lost the race, that is fine) is a prefix root
    for (const row of db.tables.tlog_tree_heads) {
      expect(row.root_hash).toBe(toHex(tree.root(row.tree_size as number)));
    }
  });

  it('a lost race on the same tree size returns the winner head instead of failing', async () => {
    const db = new FakeDb();
    await fill(db, 3);
    // Pre-insert a head for size 4 while an append is pending publication
    await appendEvent(asClient(db), mkEvent(3), { publishHead: false });
    const [a, b] = await Promise.all([ensureTreeHead(asClient(db)), ensureTreeHead(asClient(db))]);
    expect(a?.treeSize).toBe(4);
    expect(b?.treeSize).toBe(4);
    expect(a?.rootHash).toBe(b?.rootHash);
    expect(db.tables.tlog_tree_heads.filter((r) => r.tree_size === 4)).toHaveLength(1);
  });

  it('detects a stored frontier that no longer matches its root', async () => {
    const db = new FakeDb();
    await fill(db, 5);
    (db.tables.tlog_tree_heads[4].frontier as string[])[0] = '0'.repeat(64);
    await appendEvent(asClient(db), mkEvent(5), { publishHead: false });
    await expect(ensureTreeHead(asClient(db))).rejects.toMatchObject({ code: 'integrity' });
  });
});

describe('proofs end to end (what a third party would do)', () => {
  it('every entry has an inclusion proof that the standalone verifier accepts', async () => {
    const db = new FakeDb();
    await fill(db, 13);
    for (let i = 0; i < 13; i++) {
      const resp = await getInclusionProof(asClient(db), i);
      const report = await verifyInclusionProofResponse(resp, { jwks, expectedCredentialId: mkEvent(i).credentialId });
      expect(report.checks.map((c) => c.status)).toEqual(['pass', 'pass', 'pass', 'pass', 'pass']);
      expect(report.ok).toBe(true);
    }
    // proofs against older heads too
    const old = await getInclusionProof(asClient(db), 2, 5);
    expect(old.treeSize).toBe(5);
    expect((await verifyInclusionProofResponse(old, { jwks })).ok).toBe(true);
  });

  it('rejects tampered responses: entry, leaf hash, proof, root, size, index, signature, wrong credential', async () => {
    const db = new FakeDb();
    await fill(db, 9);
    const good = await getInclusionProof(asClient(db), 4);
    const verify = (r: unknown, opts = {}) => verifyInclusionProofResponse(r as never, { jwks, ...opts });
    expect((await verify(good)).ok).toBe(true);

    expect((await verify({ ...good, entry: { ...good.entry, type: 'credential.revoked' } })).ok).toBe(false);
    expect((await verify({ ...good, leafHash: '0'.repeat(64) })).ok).toBe(false);
    expect((await verify({ ...good, proof: good.proof.slice(1) })).ok).toBe(false);
    const flipped = [...good.proof];
    flipped[0] = (flipped[0][0] === 'a' ? 'b' : 'a') + flipped[0].slice(1);
    expect((await verify({ ...good, proof: flipped })).ok).toBe(false);
    expect((await verify({ ...good, index: 5 })).ok).toBe(false);
    expect((await verify({ ...good, treeSize: 10 })).ok).toBe(false);
    expect((await verify({ ...good, sth: { ...good.sth, rootHash: '1'.repeat(64) } })).ok).toBe(false);
    // forged head: same fields and header (kid/typ), signed by an attacker's key
    const evil = await generateKeyPair('ES256');
    const forgedJws = await new CompactSign(new TextEncoder().encode(canonicalJson({
      treeSize: good.sth.treeSize, rootHash: good.sth.rootHash, timestamp: good.sth.timestamp, logId: good.sth.logId,
    }))).setProtectedHeader({ alg: 'ES256', typ: TREE_HEAD_JWS_TYP, kid: 'test-key-1' }).sign(evil.privateKey);
    expect((await verify({ ...good, sth: { ...good.sth, jws: forgedJws } })).ok).toBe(false);
    // payload swapped but original signature kept
    const [h, , sig] = good.sth.jws.split('.');
    const swapped = `${h}.${Buffer.from(canonicalJson({ treeSize: 9, rootHash: '2'.repeat(64), timestamp: good.sth.timestamp, logId: good.sth.logId })).toString('base64url')}.${sig}`;
    expect((await verify({ ...good, sth: { ...good.sth, rootHash: '2'.repeat(64), jws: swapped } })).ok).toBe(false);
    expect((await verify(good, { expectedCredentialId: 'urn:uuid:other' })).ok).toBe(false);
    // no JWKS: never reported as a full pass
    const noKeys = await verifyInclusionProofResponse(good);
    expect(noKeys.ok).toBe(false);
    expect(noKeys.checks.find((c) => c.id === 'sth-signature')?.status).toBe('skip');
    expect((await verify({})).ok).toBe(false);
    expect((await verify(null)).ok).toBe(false);
  });

  it('consistency proofs between any two heads verify; a rewritten history does not', async () => {
    const db = new FakeDb();
    await fill(db, 20);
    for (const [a, b] of [[1, 2], [3, 9], [8, 16], [7, 20], [20, 20], [5, 6]] as const) {
      const resp = await getConsistencyProof(asClient(db), a, b);
      const rep = await verifyConsistencyProofResponse(resp, { jwks });
      expect(rep.ok).toBe(true);
      expect(verifyConsistency(a, b, resp.first.rootHash, resp.second.rootHash, resp.proof)).toBe(true);
    }
    const good = await getConsistencyProof(asClient(db), 7, 20);
    expect((await verifyConsistencyProofResponse({ ...good, proof: good.proof.slice(1) }, { jwks })).ok).toBe(false);
    expect((await verifyConsistencyProofResponse({ ...good, second: { ...good.second, rootHash: 'f'.repeat(64) } }, { jwks })).ok).toBe(false);
    expect((await verifyConsistencyProofResponse(null as never, { jwks })).ok).toBe(false);

    // Operator rewrites entry 3 *and* re-derives later leaf hashes; an observer who saw head@7 catches it.
    const observedOld = (await getInclusionProof(asClient(db), 0, 7)).sth;
    const forkLeaves = db.tables.tlog_entries.map((r) => fromHex(r.leaf_hash as string));
    forkLeaves[3] = fromHex('9'.repeat(64));
    const forked = new MerkleTree(forkLeaves);
    const forgedProof = forked.consistencyProof(7, 20).map(toHex);
    expect(verifyConsistency(7, 20, observedOld.rootHash, toHex(forked.root(20)), forgedProof)).toBe(false);
  });

  it('serving detects database tampering against the signed history', async () => {
    const db = new FakeDb();
    await fill(db, 10);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    // (a) entry body edited without changing its stored leaf hash
    const row = db.tables.tlog_entries[6];
    const original = JSON.parse(JSON.stringify(row.entry));
    (row.entry as Record<string, unknown>).type = 'credential.revoked';
    await expect(getInclusionProof(asClient(db), 6)).rejects.toMatchObject({ code: 'integrity' });
    row.entry = original;
    expect((await getInclusionProof(asClient(db), 6)).index).toBe(6);

    // (b) an early leaf hash rewritten (history rewrite): proofs for the signed head must refuse to be produced
    __resetTlogCaches();
    db.tables.tlog_entries[1].leaf_hash = 'e'.repeat(64);
    await expect(getInclusionProof(asClient(db), 8)).rejects.toMatchObject({ code: 'integrity' });
    await expect(getConsistencyProof(asClient(db), 3, 10)).rejects.toMatchObject({ code: 'integrity' });
  });

  it('input validation and not-found cases', async () => {
    const db = new FakeDb();
    await fill(db, 4);
    await expect(getInclusionProof(asClient(db), 4)).rejects.toMatchObject({ code: 'bad_request' });
    await expect(getInclusionProof(asClient(db), 0, 99)).rejects.toMatchObject({ code: 'not_found' });
    await expect(getConsistencyProof(asClient(db), 0, 3)).rejects.toMatchObject({ code: 'bad_request' });
    await expect(getConsistencyProof(asClient(db), 4, 3)).rejects.toMatchObject({ code: 'bad_request' });
    await expect(getConsistencyProof(asClient(db), 1, 99)).rejects.toMatchObject({ code: 'not_found' });
    await expect(getInclusionProof(asClient(new FakeDb()), 0)).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('listing', () => {
  it('pages entries up to the signed head and finds a credential', async () => {
    const db = new FakeDb();
    await fill(db, 7);
    await appendEvent(asClient(db), mkEvent(2, 'credential.revoked'));
    const p1 = await listEntries(asClient(db), 0, 5);
    expect(p1.entries.map((e) => e.index)).toEqual([0, 1, 2, 3, 4]);
    expect(p1.nextFrom).toBe(5);
    expect(p1.treeSize).toBe(8);
    const p2 = await listEntries(asClient(db), 5, 100);
    expect(p2.entries.map((e) => e.index)).toEqual([5, 6, 7]);
    expect(p2.nextFrom).toBeNull();
    expect((await listEntries(asClient(db), 50, 10)).entries).toEqual([]);
    await expect(listEntries(asClient(db), 0, 101)).rejects.toMatchObject({ code: 'bad_request' });
    await expect(listEntries(asClient(db), -1, 10)).rejects.toMatchObject({ code: 'bad_request' });
    await expect(listEntries(asClient(db), 0, 0)).rejects.toMatchObject({ code: 'bad_request' });

    const found = await findEntriesByCredential(asClient(db), mkEvent(2).credentialId);
    expect(found.entries.map((e) => [e.index, (e.entry as { type: string }).type])).toEqual([
      [2, 'credential.issued'],
      [7, 'credential.revoked'],
    ]);
    await expect(findEntriesByCredential(asClient(db), 'bad id!')).rejects.toMatchObject({ code: 'bad_request' });
    expect((await findEntriesByCredential(asClient(db), 'nope')).entries).toEqual([]);
  });
});

describe('appendEventSafely (best-effort hook)', () => {
  const input = {
    type: 'credential.issued' as const,
    credentialId: 'urn:uuid:aaaaaaaa-0000-4000-8000-000000000001',
    certificateId: 'cert-1',
    organizationId: 'org-1',
    studentId: STUDENT_ID,
  };

  it('does nothing and touches no database when the flag is off (default)', async () => {
    const db = new FakeDb();
    vi.mocked(createSupabaseAdminClient).mockResolvedValue(db as never);
    await appendEventSafely(input);
    await appendEventSafely(input, asClient(db));
    expect(createSupabaseAdminClient).not.toHaveBeenCalled();
    expect(db.rpcCalls).toBe(0);
    vi.stubEnv('TRANSPARENCY_LOG_ENABLED', 'false');
    await appendEventSafely(input, asClient(db));
    expect(db.rpcCalls).toBe(0);
  });

  it('appends via the service-role client when enabled, storing only the pseudonym', async () => {
    vi.stubEnv('TRANSPARENCY_LOG_ENABLED', 'true');
    const db = new FakeDb();
    vi.mocked(createSupabaseAdminClient).mockResolvedValue(db as never);
    await appendEventSafely(input);
    expect(db.tables.tlog_entries).toHaveLength(1);
    const entry = db.tables.tlog_entries[0].entry as Record<string, unknown>;
    expect(entry).toMatchObject({ type: 'credential.issued', credentialId: input.credentialId, studentHash: hashStudentId(STUDENT_ID) });
    expect(JSON.stringify(db.tables.tlog_entries)).not.toContain(STUDENT_ID);
    expect(db.tables.tlog_tree_heads).toHaveLength(1);
  });

  it('resolves the student and certificate/organization for revocations that only know the credential id', async () => {
    vi.stubEnv('TRANSPARENCY_LOG_ENABLED', 'true');
    const db = new FakeDb();
    db.tables.verifiable_credentials.push({
      id: 'cred-9',
      student_id: STUDENT_ID,
      credential: { credentialSubject: { certificateId: 'cert-9' } },
    });
    db.tables.certificates.push({ id: 'cert-9', organization_id: 'org-9' });
    await appendEventSafely({ type: 'credential.revoked', credentialId: 'cred-9' }, asClient(db));
    expect(db.tables.tlog_entries[0].entry).toMatchObject({
      type: 'credential.revoked',
      credentialId: 'cred-9',
      certificateId: 'cert-9',
      organizationId: 'org-9',
      studentHash: hashStudentId(STUDENT_ID),
    });
  });

  it('batch append publishes one head for the batch', async () => {
    vi.stubEnv('TRANSPARENCY_LOG_ENABLED', 'true');
    const db = new FakeDb();
    await appendEventsSafely(
      [1, 2, 3].map((i) => ({ ...input, credentialId: `cred-${i}` })),
      asClient(db)
    );
    expect(db.tables.tlog_entries).toHaveLength(3);
    expect(db.tables.tlog_tree_heads.map((h) => h.tree_size)).toEqual([3]);
  });

  it('never throws: database errors, missing salt, unresolvable student, missing tables', async () => {
    vi.stubEnv('TRANSPARENCY_LOG_ENABLED', 'true');
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(appendEventSafely(input, asClient(new FakeDb({ failWith: '08006' })))).resolves.toBeUndefined();
    expect(err).toHaveBeenCalled();

    err.mockClear();
    for (const code of ['42P01', 'PGRST205', 'PGRST204']) {
      __resetTlogCaches();
      await expect(appendEventSafely(input, asClient(new FakeDb({ failWith: code })))).resolves.toBeUndefined();
    }
    expect(err).not.toHaveBeenCalled(); // unavailable feature is a warning, not an error
    expect(warn).toHaveBeenCalled();

    vi.stubEnv('TRANSPARENCY_LOG_SALT', '');
    err.mockClear();
    const db = new FakeDb();
    await expect(appendEventSafely(input, asClient(db))).resolves.toBeUndefined();
    expect(db.tables.tlog_entries).toHaveLength(0);
    expect(err).toHaveBeenCalled(); // misconfiguration is an error, not a quiet "unavailable"

    vi.stubEnv('TRANSPARENCY_LOG_SALT', SALT);
    await expect(appendEventSafely({ type: 'credential.revoked', credentialId: 'unknown-cred' }, asClient(db))).resolves.toBeUndefined();
    expect(db.tables.tlog_entries).toHaveLength(0);

    // admin client creation itself failing
    vi.mocked(createSupabaseAdminClient).mockRejectedValue(new Error('no env'));
    await expect(appendEventSafely(input)).resolves.toBeUndefined();
  });

  it('keeps the entry when only head signing fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const db = new FakeDb();
    vi.mocked(signPayload).mockRejectedValueOnce(new Error('signer down'));
    const res = await appendEvent(asClient(db), mkEvent(0));
    expect(res.index).toBe(0);
    expect(res.treeHead).toBeNull();
    expect(db.tables.tlog_entries).toHaveLength(1);
    // the next read catches up and signs a head for the stored entry
    const head = await getLatestTreeHead(asClient(db));
    expect(head?.treeSize).toBe(1);
  });
});

describe('merkle verifier agrees with stored heads (sanity on exported helpers)', () => {
  it('verifyInclusion on a served response matches the response flags', async () => {
    const db = new FakeDb();
    await fill(db, 5);
    const r = await getInclusionProof(asClient(db), 3);
    expect(verifyInclusion(r.leafHash, r.index, r.treeSize, r.proof, r.sth.rootHash)).toBe(true);
    expect(TREE_HEAD_JWS_TYP).toBe('application/tlog-sth+json');
  });
});
