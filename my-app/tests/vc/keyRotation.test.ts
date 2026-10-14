// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { generateKeyPair, exportJWK, calculateJwkThumbprint, SignJWT, importJWK, decodeProtectedHeader, type JWK } from 'jose';

vi.mock('@/lib/envServer', () => ({
  getIssuerJwkJson: vi.fn(),
}));

import { getIssuerJwkJson } from '@/lib/envServer';
import { signCredential, getIssuerPublicJwks, getPreviousPublicJwks, toPublicJwk, verifyCredentialJwsWithKeys } from '@/lib/vc';
import { verifyCredential, type StoreClient } from '@/lib/vcVerify';
import { GET as jwksGET } from '@/app/.well-known/jwks.json/route';

const ISSUER = 'did:web:campussync.test';
const PRIVATE_MEMBERS = ['d', 'p', 'q', 'dp', 'dq', 'qi', 'k', 'oth'];
const SUBJECT = {
  id: '11111111-1111-4111-8111-111111111111',
  certificateId: '22222222-2222-4222-8222-222222222222',
  title: 'Intro to Testing',
  institution: 'Test University',
  dateIssued: '2025-01-01',
};

type Alg = 'EdDSA' | 'ES256' | 'RS256';

async function makeKey(alg: Alg, kid?: string): Promise<JWK> {
  const { privateKey } = await generateKeyPair(alg, { extractable: true, ...(alg === 'EdDSA' ? { crv: 'Ed25519' } : {}) });
  const jwk = await exportJWK(privateKey);
  return { ...jwk, alg, ...(kid ? { kid } : {}) };
}

const setCurrent = (jwk: JWK) => vi.mocked(getIssuerJwkJson).mockReturnValue(JSON.stringify(jwk));
const setPrevious = (v: unknown) => {
  process.env.VC_ISSUER_PREVIOUS_PUBLIC_JWKS = typeof v === 'string' ? v : JSON.stringify(v);
};

function activeStore(id: string): StoreClient {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { id, status: 'active', revoked_at: null, revoked_reason: null }, error: null }),
        }),
      }),
    }),
  } as unknown as StoreClient;
}

const issue = () => signCredential({ issuerDid: ISSUER, credential: { credentialSubject: SUBJECT } });

beforeEach(() => {
  delete process.env.VC_ISSUER_PREVIOUS_PUBLIC_JWKS;
  delete process.env.NEXT_PUBLIC_ISSUER_DID;
  delete process.env.VC_STATUS_LIST_ENABLED;
});
afterEach(() => {
  delete process.env.VC_ISSUER_PREVIOUS_PUBLIC_JWKS;
});

describe('kid handling', () => {
  it('derives the RFC 7638 thumbprint as kid when the JWK has none, and uses it consistently', async () => {
    const jwk = await makeKey('EdDSA'); // no kid
    setCurrent(jwk);
    const expected = await calculateJwkThumbprint(toPublicJwk(jwk), 'sha256');

    const a = await issue();
    const b = await issue();
    expect(decodeProtectedHeader(a.proof.jws).kid).toBe(expected);
    expect(decodeProtectedHeader(b.proof.jws).kid).toBe(expected); // stable across calls
    expect(a.proof.verificationMethod).toBe(`${ISSUER}#${expected}`);

    const [pub] = await getIssuerPublicJwks();
    expect(pub.kid).toBe(expected);
    const body = await (await jwksGET()).json();
    expect(body.keys[0].kid).toBe(expected);
    // thumbprint is computed over public members only, so the private JWK gives the same value
    expect(await calculateJwkThumbprint(jwk, 'sha256')).toBe(expected);
  });

  it('an explicit kid wins over the thumbprint', async () => {
    setCurrent(await makeKey('ES256', 'my-explicit-kid'));
    const vc = await issue();
    expect(decodeProtectedHeader(vc.proof.jws).kid).toBe('my-explicit-kid');
    expect(vc.proof.verificationMethod).toBe(`${ISSUER}#my-explicit-kid`);
  });
});

describe('key rotation', () => {
  it.each([
    ['EdDSA', 'EdDSA'],
    ['RS256', 'EdDSA'],
    ['ES256', 'ES256'],
  ] as const)('credential signed with %s still verifies after rotating to %s', async (oldAlg, newAlg) => {
    const oldKey = await makeKey(oldAlg);
    setCurrent(oldKey);
    const oldVc = await issue();

    // --- rotate: new current key, old PUBLIC key moves to the previous list ---
    const newKey = await makeKey(newAlg);
    setCurrent(newKey);
    setPrevious([toPublicJwk(oldKey)]);

    const oldResult = await verifyCredential({ jws: oldVc.proof.jws }, { supabase: activeStore(oldVc.id!) });
    expect(oldResult).toMatchObject({ valid: true, status: 'active' });

    const newVc = await issue();
    expect(decodeProtectedHeader(newVc.proof.jws).kid).not.toBe(decodeProtectedHeader(oldVc.proof.jws).kid);
    expect(await verifyCredential({ jws: newVc.proof.jws }, { supabase: activeStore(newVc.id!) })).toMatchObject({ valid: true });

    // JWKS lists the current key first, then the previous one, public members only
    const { keys } = await (await jwksGET()).json();
    expect(keys).toHaveLength(2);
    expect(keys[0].kid).toBe(decodeProtectedHeader(newVc.proof.jws).kid);
    expect(keys[1].kid).toBe(decodeProtectedHeader(oldVc.proof.jws).kid);
    for (const k of keys) for (const m of PRIVATE_MEMBERS) expect(k).not.toHaveProperty(m);
  });

  it('without the previous list, a credential from the old key fails with unknown_key', async () => {
    setCurrent(await makeKey('EdDSA'));
    const oldVc = await issue();
    setCurrent(await makeKey('EdDSA')); // rotated, but previous list NOT configured

    const r = await verifyCredential({ jws: oldVc.proof.jws }, { supabase: activeStore(oldVc.id!) });
    expect(r).toMatchObject({ valid: false, reason: 'unknown_key' });
  });

  it('a token whose kid matches no trusted key fails (no fallback to the current key)', async () => {
    const key = await makeKey('EdDSA', 'real-kid');
    setCurrent(key);
    // signed by the REAL current key but advertising an unknown kid
    const imported = await importJWK(key, 'EdDSA');
    const jws = await new SignJWT({ vc: { id: 'urn:uuid:x', credentialSubject: { id: 's' } } })
      .setProtectedHeader({ alg: 'EdDSA', kid: 'some-other-kid' })
      .setIssuer(ISSUER)
      .sign(imported);

    const r = await verifyCredential({ jws }, { supabase: activeStore('urn:uuid:x') });
    expect(r).toMatchObject({ valid: false, reason: 'unknown_key' });
  });

  it('a forged signature under a known kid still fails with invalid_signature', async () => {
    const key = await makeKey('EdDSA', 'real-kid');
    setCurrent(key);
    const attacker = await makeKey('EdDSA');
    const jws = await new SignJWT({ vc: { id: 'urn:uuid:x', credentialSubject: { id: 's' } } })
      .setProtectedHeader({ alg: 'EdDSA', kid: 'real-kid' })
      .setIssuer(ISSUER)
      .sign(await importJWK(attacker, 'EdDSA'));
    const r = await verifyCredential({ jws }, { supabase: activeStore('urn:uuid:x') });
    expect(r).toMatchObject({ valid: false, reason: 'invalid_signature' });
  });

  it('legacy tokens without a kid verify against the current key, then the previous keys', async () => {
    const oldKey = await makeKey('ES256');
    const newKey = await makeKey('EdDSA');
    setCurrent(newKey);
    setPrevious([toPublicJwk(oldKey)]);
    const keys = await getIssuerPublicJwks();

    const sign = async (k: JWK, alg: Alg) =>
      new SignJWT({ vc: { id: 'urn:uuid:legacy', credentialSubject: { id: 's' } } })
        .setProtectedHeader({ alg }) // no kid
        .setIssuer(ISSUER)
        .sign(await importJWK(k, alg));

    const signedNew = await verifyCredentialJwsWithKeys(await sign(newKey, 'EdDSA'), keys);
    expect(signedNew.key.kid).toBe(keys[0].kid);
    const signedOld = await verifyCredentialJwsWithKeys(await sign(oldKey, 'ES256'), keys);
    expect(signedOld.key.kid).toBe(keys[1].kid);

    const stranger = await makeKey('EdDSA');
    await expect(verifyCredentialJwsWithKeys(await sign(stranger, 'EdDSA'), keys)).rejects.toThrow();
  });
});

describe('VC_ISSUER_PREVIOUS_PUBLIC_JWKS validation', () => {
  it.each(PRIVATE_MEMBERS)('rejects an entry containing the private member "%s"', async member => {
    const key = await makeKey('EdDSA');
    setCurrent(await makeKey('EdDSA'));
    setPrevious([{ ...toPublicJwk(key), [member]: 'x' }]);
    await expect(getPreviousPublicJwks()).rejects.toThrow(/private member/);
  });

  it('a private previous key makes verification fail closed, the JWKS 503, but signing keeps working', async () => {
    setCurrent(await makeKey('EdDSA'));
    const leaked = await makeKey('EdDSA'); // full private key pasted by mistake
    setPrevious([leaked]);

    const vc = await issue(); // issuance is not affected
    expect(vc.proof.jws).toBeTruthy();

    const r = await verifyCredential({ jws: vc.proof.jws }, { supabase: activeStore(vc.id!) });
    expect(r).toMatchObject({ valid: false, reason: 'verifier_misconfigured' });

    const res = await jwksGET();
    expect(res.status).toBe(503);
    expect(JSON.stringify(await res.json())).not.toContain(leaked.d as string);
  });

  it('rejects non-JSON, non-array and non-object entries; empty/unset means no previous keys', async () => {
    setCurrent(await makeKey('EdDSA'));
    setPrevious('not json');
    await expect(getPreviousPublicJwks()).rejects.toThrow(/valid JSON/);
    setPrevious({ keys: [] });
    await expect(getPreviousPublicJwks()).rejects.toThrow(/array/);
    setPrevious(['nope']);
    await expect(getPreviousPublicJwks()).rejects.toThrow(/not a JWK object/);
    setPrevious([{ kty: 'oct', k: 'AAAA' }]);
    await expect(getPreviousPublicJwks()).rejects.toThrow();
    setPrevious('');
    expect(await getPreviousPublicJwks()).toEqual([]);
    delete process.env.VC_ISSUER_PREVIOUS_PUBLIC_JWKS;
    expect(await getPreviousPublicJwks()).toEqual([]);
  });

  it('infers alg for previous keys that omit it and derives a thumbprint kid', async () => {
    const old = await makeKey('EdDSA');
    const pub = toPublicJwk(old);
    delete pub.alg;
    delete pub.use;
    setCurrent(await makeKey('ES256'));
    setPrevious([pub]);
    const [prev] = await getPreviousPublicJwks();
    expect(prev.alg).toBe('EdDSA');
    expect(prev.kid).toBe(await calculateJwkThumbprint(pub, 'sha256'));
  });

  it('dedupes the same key listed as previous and current, rejects a kid clash with a different key', async () => {
    const cur = await makeKey('EdDSA', 'same');
    setCurrent(cur);
    setPrevious([toPublicJwk(cur)]);
    expect(await getIssuerPublicJwks()).toHaveLength(1);

    const other = await makeKey('EdDSA', 'same');
    setPrevious([toPublicJwk(other)]);
    await expect(getIssuerPublicJwks()).rejects.toThrow(/already used by a different key/);
  });
});
