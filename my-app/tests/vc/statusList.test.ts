// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { gzipSync } from 'node:zlib';
import { generateKeyPair, exportJWK, importJWK, jwtVerify, SignJWT, type JWK } from 'jose';

vi.mock('@/lib/envServer', () => ({
  getIssuerJwkJson: vi.fn(),
}));

import { getIssuerJwkJson } from '@/lib/envServer';
import { signCredential, toPublicJwk } from '@/lib/vc';
import {
  DEFAULT_LIST_SIZE,
  __resetStatusListCursor,
  allocateStatusEntry,
  base64ToBytes,
  buildStatusListCredential,
  bytesToBase64,
  checkStatusBit,
  createBitstring,
  decodeList,
  encodeList,
  getBit,
  isStatusListEnabled,
  markCredentialsRevoked,
  parseStatusEntry,
  setBit,
  setRevocationBit,
  statusListUrl,
} from '@/lib/statusList';
import { verifyCredential, type StoreClient } from '@/lib/vcVerify';
import { createFakeStatusDb } from './fakeStatusDb';

const ISSUER = 'did:web:campussync.test';
const BASE = 'https://campussync.test';
const SUBJECT = { id: 'student-1', certificateId: 'cert-1', title: 'T', institution: 'I', dateIssued: '2025-01-01' };

let privateJwk: JWK;

beforeEach(async () => {
  const { privateKey } = await generateKeyPair('EdDSA', { extractable: true, crv: 'Ed25519' });
  privateJwk = { ...(await exportJWK(privateKey)), alg: 'EdDSA' };
  vi.mocked(getIssuerJwkJson).mockReturnValue(JSON.stringify(privateJwk));
  process.env.NEXT_PUBLIC_BASE_URL = BASE;
  process.env.NEXT_PUBLIC_ISSUER_DID = ISSUER;
  process.env.VC_STATUS_LIST_ENABLED = 'true';
  delete process.env.VC_ISSUER_PREVIOUS_PUBLIC_JWKS;
  __resetStatusListCursor();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  delete process.env.VC_STATUS_LIST_ENABLED;
  delete process.env.NEXT_PUBLIC_BASE_URL;
  delete process.env.NEXT_PUBLIC_ISSUER_DID;
});

describe('bitstring operations', () => {
  it('default size is 131072 bits (16 KiB) and starts all clear', () => {
    const bits = createBitstring();
    expect(DEFAULT_LIST_SIZE).toBe(131072);
    expect(bits.length).toBe(16384);
    expect(bits.every(b => b === 0)).toBe(true);
  });

  it('index 0 is the most significant bit of byte 0 (W3C draft order)', () => {
    const bits = createBitstring(32);
    setBit(bits, 0);
    expect(bits[0]).toBe(0b1000_0000);
    setBit(bits, 7);
    expect(bits[0]).toBe(0b1000_0001);
    setBit(bits, 8);
    expect(bits[1]).toBe(0b1000_0000);
    setBit(bits, 31);
    expect(bits[3]).toBe(0b0000_0001);
    expect([0, 7, 8, 31].every(i => getBit(bits, i))).toBe(true);
    expect([1, 6, 9, 30].some(i => getBit(bits, i))).toBe(false);
  });

  it('clears bits and does not disturb neighbours', () => {
    const bits = createBitstring(16);
    setBit(bits, 3);
    setBit(bits, 4);
    setBit(bits, 3, false);
    expect(getBit(bits, 3)).toBe(false);
    expect(getBit(bits, 4)).toBe(true);
  });

  it('rejects out-of-range / non-integer indexes and invalid sizes', () => {
    const bits = createBitstring(16);
    expect(() => getBit(bits, 16)).toThrow(RangeError);
    expect(() => setBit(bits, -1)).toThrow(RangeError);
    expect(() => setBit(bits, 1.5)).toThrow(RangeError);
    expect(() => createBitstring(0)).toThrow();
    expect(() => createBitstring(12)).toThrow();
  });
});

describe('encode / decode', () => {
  it('round-trips a default-size list with random bits', () => {
    const bits = createBitstring();
    const set = [0, 1, 7, 8, 1000, 65535, 131071];
    set.forEach(i => setBit(bits, i));
    const encoded = encodeList(bits);
    expect(encoded.startsWith('u')).toBe(true);
    expect(encoded).toMatch(/^u[A-Za-z0-9_-]+$/); // base64url, no padding
    const decoded = decodeList(encoded);
    expect(decoded.length).toBe(bits.length);
    expect(Buffer.from(decoded).equals(Buffer.from(bits))).toBe(true);
    expect(set.every(i => getBit(decoded, i))).toBe(true);
  });

  it('an all-clear 16 KiB list compresses to a few dozen bytes', () => {
    expect(encodeList(createBitstring()).length).toBeLessThan(100);
  });

  it('database base64 representation round-trips', () => {
    const bits = createBitstring(64);
    setBit(bits, 13);
    expect(Buffer.from(base64ToBytes(bytesToBase64(bits))).equals(Buffer.from(bits))).toBe(true);
  });

  it('rejects a missing multibase prefix, bad gzip and decompression bombs', () => {
    expect(() => decodeList(encodeList(createBitstring(16)).slice(1))).toThrow();
    expect(() => decodeList('u' + Buffer.from('not gzip').toString('base64url'))).toThrow();
    const bomb = 'u' + gzipSync(Buffer.alloc(9 * 1024 * 1024)).toString('base64url');
    expect(() => decodeList(bomb)).toThrow();
  });
});

describe('index allocation', () => {
  it('returns sequential indexes and a spec-shaped credentialStatus entry', async () => {
    const db = createFakeStatusDb();
    const a = await allocateStatusEntry(db.client);
    const b = await allocateStatusEntry(db.client);
    expect([a?.index, b?.index]).toEqual([0, 1]);
    expect(a?.entry).toEqual({
      id: `${BASE}/api/status/revocation/rev-1#0`,
      type: 'BitstringStatusListEntry',
      statusPurpose: 'revocation',
      statusListIndex: '0',
      statusListCredential: `${BASE}/api/status/revocation/rev-1`,
    });
    expect(db.lists.get('rev-1')?.nextIndex).toBe(2);
  });

  it('moves on to the next list when one is full', async () => {
    const db = createFakeStatusDb({ size: 8 });
    const seen: string[] = [];
    for (let i = 0; i < 10; i++) {
      const r = await allocateStatusEntry(db.client);
      seen.push(`${r?.listId}:${r?.index}`);
    }
    expect(seen.slice(0, 8)).toEqual(Array.from({ length: 8 }, (_, i) => `rev-1:${i}`));
    expect(seen.slice(8)).toEqual(['rev-2:0', 'rev-2:1']);
  });

  it('never hands the same slot out twice', async () => {
    const db = createFakeStatusDb({ size: 16 });
    const slots = new Set<string>();
    for (let i = 0; i < 30; i++) {
      const r = await allocateStatusEntry(db.client);
      slots.add(`${r?.listId}:${r?.index}`);
    }
    expect(slots.size).toBe(30);
  });

  it('is disabled (no database call) unless VC_STATUS_LIST_ENABLED=true', async () => {
    const db = createFakeStatusDb();
    process.env.VC_STATUS_LIST_ENABLED = 'false';
    expect(isStatusListEnabled()).toBe(false);
    expect(await allocateStatusEntry(db.client)).toBeNull();
    delete process.env.VC_STATUS_LIST_ENABLED;
    expect(await allocateStatusEntry(db.client)).toBeNull();
    expect(db.calls).toEqual([]);
  });

  it.each(['42P01', '42883', 'PGRST202', 'PGRST205', '42703', 'PGRST204'])(
    'treats %s (migration not applied) as unavailable: returns null, never throws',
    async code => {
      const db = createFakeStatusDb();
      db.failWith = code;
      await expect(allocateStatusEntry(db.client)).resolves.toBeNull();
    }
  );

  it('returns null on other database errors as well', async () => {
    const db = createFakeStatusDb();
    db.failWith = '57014';
    expect(await allocateStatusEntry(db.client)).toBeNull();
  });

  it('builds the URL from the did:web host when no base URL is configured', () => {
    delete process.env.NEXT_PUBLIC_BASE_URL;
    delete process.env.NEXT_PUBLIC_SITE_URL;
    process.env.NEXT_PUBLIC_ISSUER_DID = 'did:web:uni.example';
    expect(statusListUrl('rev-3')).toBe('https://uni.example/api/status/revocation/rev-3');
    process.env.NEXT_PUBLIC_ISSUER_DID = 'did:web:localhost%3A3000';
    expect(statusListUrl('rev-3')).toBe('http://localhost:3000/api/status/revocation/rev-3');
    process.env.NEXT_PUBLIC_ISSUER_DID = 'did:key:abc';
    expect(() => statusListUrl('rev-3')).toThrow();
  });
});

describe('signed status list credential', () => {
  it('is a JWS signed by the issuer key containing the expected BitstringStatusListCredential', async () => {
    const bits = createBitstring();
    setBit(bits, 42);
    const url = `${BASE}/api/status/revocation/rev-1`;
    const signed = await buildStatusListCredential({ id: url, purpose: 'revocation', bits, issuerDid: ISSUER, updatedAt: '2026-01-01T00:00:00.000Z' });
    expect(signed).toMatchObject({ id: url, updatedAt: '2026-01-01T00:00:00.000Z' });

    const key = await importJWK(toPublicJwk(privateJwk), 'EdDSA');
    const { payload, protectedHeader } = await jwtVerify(signed.jws, key, { algorithms: ['EdDSA'], issuer: ISSUER });
    expect(protectedHeader.kid).toBeTruthy();
    const vc = payload.vc as any;
    expect(vc.type).toEqual(['VerifiableCredential', 'BitstringStatusListCredential']);
    expect(vc.credentialSubject).toMatchObject({ id: `${url}#list`, type: 'BitstringStatusList', statusPurpose: 'revocation' });
    const decoded = decodeList(vc.credentialSubject.encodedList);
    expect(getBit(decoded, 42)).toBe(true);
    expect(getBit(decoded, 41)).toBe(false);

    // a different key must not verify it
    const { publicKey } = await generateKeyPair('EdDSA', { extractable: true, crv: 'Ed25519' });
    await expect(jwtVerify(signed.jws, publicKey, { algorithms: ['EdDSA'] })).rejects.toThrow();
  });
});

describe('credentialStatus inside the signed credential', () => {
  it('signCredential embeds the entry in the SIGNED payload when given, and omits it otherwise', async () => {
    const db = createFakeStatusDb();
    const slot = await allocateStatusEntry(db.client);
    const withStatus = await signCredential({ issuerDid: ISSUER, credentialStatus: slot!.entry, credential: { credentialSubject: SUBJECT } });
    const without = await signCredential({ issuerDid: ISSUER, credential: { credentialSubject: SUBJECT } });

    const key = await importJWK(toPublicJwk(privateJwk), 'EdDSA');
    const a = await jwtVerify(withStatus.proof.jws, key);
    expect((a.payload.vc as any).credentialStatus).toEqual(slot!.entry);
    expect(withStatus.credentialStatus).toEqual(slot!.entry);
    const b = await jwtVerify(without.proof.jws, key);
    expect(b.payload.vc).not.toHaveProperty('credentialStatus');
    expect(without).not.toHaveProperty('credentialStatus');
  });

  it('parseStatusEntry accepts only well-formed revocation entries of this issuer', () => {
    const ok = { credentialStatus: { type: 'BitstringStatusListEntry', statusPurpose: 'revocation', statusListIndex: '7', statusListCredential: `${BASE}/api/status/revocation/rev-2` } };
    expect(parseStatusEntry(ok)).toEqual({ listId: 'rev-2', index: 7, listUrl: `${BASE}/api/status/revocation/rev-2` });
    expect(parseStatusEntry({ credentialStatus: [ok.credentialStatus] })).toMatchObject({ index: 7 });
    expect(parseStatusEntry({})).toBeNull();
    expect(parseStatusEntry(null)).toBeNull();
    for (const bad of [
      { ...ok.credentialStatus, type: 'Other' },
      { ...ok.credentialStatus, statusPurpose: 'suspension' },
      { ...ok.credentialStatus, statusListIndex: '-1' },
      { ...ok.credentialStatus, statusListIndex: 7 },
      { ...ok.credentialStatus, statusListCredential: 'https://x.test/elsewhere' },
      { ...ok.credentialStatus, statusListCredential: 'not a url' },
    ]) {
      expect(parseStatusEntry({ credentialStatus: bad })).toBeNull();
    }
  });
});

describe('revocation flips the bit', () => {
  async function issuedWithSlot(db: ReturnType<typeof createFakeStatusDb>) {
    const slot = await allocateStatusEntry(db.client);
    const vc = await signCredential({ issuerDid: ISSUER, credentialStatus: slot!.entry, credential: { credentialSubject: SUBJECT } });
    return { slot: slot!, vc };
  }

  it('markCredentialsRevoked sets exactly the credential bit', async () => {
    const db = createFakeStatusDb();
    const first = await issuedWithSlot(db);
    const second = await issuedWithSlot(db);

    const flipped = await markCredentialsRevoked([{ id: first.vc.id, credential: first.vc }], db.client);
    expect(flipped).toBe(1);
    const bytes = db.lists.get('rev-1')!.bytes;
    expect(getBit(bytes, first.slot.index)).toBe(true);
    expect(getBit(bytes, second.slot.index)).toBe(false);

    // idempotent
    expect(await markCredentialsRevoked([{ credential: first.vc }], db.client)).toBe(1);
    expect(getBit(db.lists.get('rev-1')!.bytes, second.slot.index)).toBe(false);
  });

  it('skips credentials without an entry without touching the database', async () => {
    const db = createFakeStatusDb();
    const legacy = await signCredential({ issuerDid: ISSUER, credential: { credentialSubject: SUBJECT } });
    expect(await markCredentialsRevoked([{ id: legacy.id, credential: legacy }, { credential: null }], db.client)).toBe(0);
    expect(db.calls).toEqual([]);
  });

  it('never throws: unavailable storage, unallocated index or a throwing client yield 0 / false', async () => {
    const db = createFakeStatusDb();
    const { vc } = await issuedWithSlot(db);
    db.failWith = '42883';
    await expect(markCredentialsRevoked([{ credential: vc }], db.client)).resolves.toBe(0);
    db.failWith = null;
    expect(await setRevocationBit({ listId: 'rev-1', index: 999, listUrl: 'x' }, db.client)).toBe(false);
    const boom = { rpc: () => { throw new Error('boom'); }, from: () => { throw new Error('boom'); } } as any;
    await expect(markCredentialsRevoked([{ credential: vc }], boom)).resolves.toBe(0);
  });

  it('checkStatusBit reports clear / revoked / unavailable / error', async () => {
    const db = createFakeStatusDb();
    const { slot, vc } = await issuedWithSlot(db);
    const entry = { listId: slot.listId, index: slot.index, listUrl: slot.listUrl };
    expect(await checkStatusBit(entry, db.client)).toEqual({ state: 'clear' });
    await markCredentialsRevoked([{ credential: vc }], db.client);
    expect(await checkStatusBit(entry, db.client)).toEqual({ state: 'revoked' });
    expect(await checkStatusBit({ ...entry, listId: 'rev-9' }, db.client)).toEqual({ state: 'error' }); // list missing
    db.failWith = '42P01';
    expect(await checkStatusBit(entry, db.client)).toEqual({ state: 'unavailable' });
    db.failWith = '57014';
    expect(await checkStatusBit(entry, db.client)).toEqual({ state: 'error' });
  });
});

describe('verifyCredential with a status list', () => {
  const store = (id: string, status = 'active'): StoreClient =>
    ({
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id, status, revoked_at: null, revoked_reason: null }, error: null }) }) }) }),
    }) as unknown as StoreClient;

  async function setup() {
    const db = createFakeStatusDb();
    const slot = (await allocateStatusEntry(db.client))!;
    const vc = await signCredential({ issuerDid: ISSUER, credentialStatus: slot.entry, credential: { credentialSubject: SUBJECT } });
    return { db, slot, vc };
  }

  it('valid while the bit is clear, revoked once it is set (even if the status column still says active)', async () => {
    const { db, vc } = await setup();
    const ok = await verifyCredential({ jws: vc.proof.jws }, { supabase: store(vc.id!), statusDb: db.client });
    expect(ok).toMatchObject({ valid: true, status: 'active', statusList: 'clear' });

    await markCredentialsRevoked([{ credential: vc }], db.client);
    const revoked = await verifyCredential({ jws: vc.proof.jws }, { supabase: store(vc.id!), statusDb: db.client });
    expect(revoked).toMatchObject({ valid: false, reason: 'revoked', status: 'revoked' });
  });

  it('the status column stays authoritative: revoked column wins over a clear bit', async () => {
    const { db, vc } = await setup();
    const r = await verifyCredential({ jws: vc.proof.jws }, { supabase: store(vc.id!, 'revoked'), statusDb: db.client });
    expect(r).toMatchObject({ valid: false, reason: 'revoked' });
    expect(db.calls).toEqual(['rpc:allocate_status_index']); // only the setup allocation: the list was never read
  });

  it('storage not installed: the column decides and the result says the bit was not consulted', async () => {
    const { db, vc } = await setup();
    db.failWith = '42P01';
    const r = await verifyCredential({ jws: vc.proof.jws }, { supabase: store(vc.id!), statusDb: db.client });
    expect(r).toMatchObject({ valid: true, statusList: 'unavailable' });
  });

  it('fails closed on a lookup error or a missing list', async () => {
    const { db, vc } = await setup();
    db.failWith = '57014';
    expect(await verifyCredential({ jws: vc.proof.jws }, { supabase: store(vc.id!), statusDb: db.client })).toMatchObject({ valid: false, reason: 'revocation_check_failed' });
    db.failWith = null;
    db.lists.clear();
    expect(await verifyCredential({ jws: vc.proof.jws }, { supabase: store(vc.id!), statusDb: db.client })).toMatchObject({ valid: false, reason: 'revocation_check_failed' });
  });

  it('feature off / credential without an entry: behaviour unchanged, the list is never consulted', async () => {
    delete process.env.VC_STATUS_LIST_ENABLED;
    const db = createFakeStatusDb();
    const legacy = await signCredential({ issuerDid: ISSUER, credential: { credentialSubject: SUBJECT } });
    const r = await verifyCredential({ jws: legacy.proof.jws }, { supabase: store(legacy.id!), statusDb: db.client });
    expect(r.valid).toBe(true);
    expect(r).not.toHaveProperty('statusList');
    expect(db.calls).toEqual([]);
  });

  it('an attacker cannot strip or move the entry: it is inside the signature', async () => {
    const { db, vc, slot } = await setup();
    await markCredentialsRevoked([{ credential: vc }], db.client);
    // re-sign the same payload minus credentialStatus with an attacker key
    const attacker = await generateKeyPair('EdDSA', { extractable: true, crv: 'Ed25519' });
    const forged = await new SignJWT({ vc: { id: vc.id, credentialSubject: SUBJECT } })
      .setProtectedHeader({ alg: 'EdDSA' })
      .setIssuer(ISSUER)
      .sign(attacker.privateKey);
    const r = await verifyCredential({ jws: forged }, { supabase: store(vc.id!), statusDb: db.client });
    expect(r.valid).toBe(false);
    expect(r.reason).toBe('invalid_signature');
    expect(slot.index).toBe(0);
  });
});
