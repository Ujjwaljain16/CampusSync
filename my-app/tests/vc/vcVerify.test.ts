// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  generateKeyPair,
  exportJWK,
  importJWK,
  jwtVerify,
  SignJWT,
  decodeJwt,
  base64url,
  type JWK,
} from 'jose';

vi.mock('@/lib/envServer', () => ({
  getIssuerJwkJson: vi.fn(),
}));

import { getIssuerJwkJson } from '@/lib/envServer';
import { signCredential, verifyCredentialJws, getIssuerPublicJwk } from '@/lib/vc';
import { verifyCredential, type StoreClient } from '@/lib/vcVerify';

const ISSUER = 'did:web:campussync.test';

async function makePrivateJwk(alg: 'EdDSA' | 'ES256', kid = 'test-key-1'): Promise<JWK> {
  const { privateKey } = await generateKeyPair(alg, { extractable: true, ...(alg === 'EdDSA' ? { crv: 'Ed25519' } : {}) });
  const jwk = await exportJWK(privateKey);
  return { ...jwk, alg, kid, use: 'sig' };
}

interface DbResult {
  data: unknown;
  error: { code?: string; message: string } | null;
}

function mockStore(result: DbResult | (() => Promise<DbResult>)): StoreClient {
  const run = typeof result === 'function' ? result : async () => result;
  return {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: run }),
      }),
    }),
  } as unknown as StoreClient;
}

const activeRow = (id: string): DbResult => ({
  data: { id, status: 'active', revoked_at: null, revoked_reason: null },
  error: null,
});

const SUBJECT = {
  id: '11111111-1111-4111-8111-111111111111',
  certificateId: '22222222-2222-4222-8222-222222222222',
  title: 'Intro to Testing',
  institution: 'Test University',
  dateIssued: '2025-01-01',
};

let privateJwk: JWK;

async function issue() {
  return signCredential({
    issuerDid: ISSUER,
    verificationMethod: `${ISSUER}#keys-1`,
    credential: { credentialSubject: SUBJECT },
  });
}

describe.each(['EdDSA', 'ES256'] as const)('verifyCredential (%s)', (alg) => {
  beforeEach(async () => {
    privateJwk = await makePrivateJwk(alg);
    vi.mocked(getIssuerJwkJson).mockReturnValue(JSON.stringify(privateJwk));
    delete process.env.VC_VALIDITY_DAYS;
    delete process.env.NEXT_PUBLIC_ISSUER_DID;
  });

  it('sign -> verify succeeds and returns fields from the signed payload', async () => {
    const vc = await issue();
    const result = await verifyCredential({ jws: vc.proof.jws }, { supabase: mockStore(activeRow(vc.id!)) });

    expect(result.valid).toBe(true);
    expect(result.status).toBe('active');
    expect(result.credentialId).toBe(vc.id);
    expect(result.issuer).toBe(ISSUER);
    expect(result.credentialSubject).toMatchObject({ title: 'Intro to Testing', institution: 'Test University' });
    expect(result.expiresAt).toBeDefined();
  });

  it('new credentials carry jti, sub, nbf and exp (default 730 days)', async () => {
    const vc = await issue();
    const claims = decodeJwt(vc.proof.jws);
    expect(claims.jti).toBe(vc.id);
    expect(claims.sub).toBe(SUBJECT.id);
    expect(claims.nbf).toBeTypeOf('number');
    expect(claims.exp! - claims.iat!).toBe(730 * 86400);
  });

  it('honours VC_VALIDITY_DAYS and falls back to the default for invalid values', async () => {
    process.env.VC_VALIDITY_DAYS = '10';
    let claims = decodeJwt((await issue()).proof.jws);
    expect(claims.exp! - claims.iat!).toBe(10 * 86400);

    for (const bad of ['0', '-5', 'abc', '1.5']) {
      process.env.VC_VALIDITY_DAYS = bad;
      claims = decodeJwt((await issue()).proof.jws);
      expect(claims.exp! - claims.iat!).toBe(730 * 86400);
    }
  });

  it('rejects a tampered payload', async () => {
    const vc = await issue();
    const [h, p, s] = vc.proof.jws.split('.');
    const payload = JSON.parse(new TextDecoder().decode(base64url.decode(p)));
    payload.vc.credentialSubject.title = 'Forged Degree';
    const forged = [h, base64url.encode(JSON.stringify(payload)), s].join('.');

    const result = await verifyCredential({ jws: forged }, { supabase: mockStore(activeRow(vc.id!)) });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('invalid_signature');
    expect(result.credentialSubject).toBeUndefined();
  });

  it('rejects a token signed by a different key', async () => {
    const other = await makePrivateJwk(alg);
    const key = await importJWK(other, alg);
    const jws = await new SignJWT({ vc: { id: 'urn:uuid:x', credentialSubject: SUBJECT } })
      .setProtectedHeader({ alg })
      .setIssuer(ISSUER)
      .setIssuedAt()
      .sign(key);

    const result = await verifyCredential({ jws }, { supabase: mockStore(activeRow('urn:uuid:x')) });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('invalid_signature');
  });

  it('rejects an alg:none token', async () => {
    const vc = await issue();
    const payloadSeg = vc.proof.jws.split('.')[1];
    const header = base64url.encode(JSON.stringify({ alg: 'none' }));
    const jws = `${header}.${payloadSeg}.`;

    const result = await verifyCredential({ jws }, { supabase: mockStore(activeRow(vc.id!)) });
    expect(result.valid).toBe(false);
    expect(['alg_not_allowed', 'malformed_token']).toContain(result.reason);
  });

  it('rejects an HS256 token signed with the public JWK bytes (algorithm confusion)', async () => {
    const { d, ...pub } = privateJwk;
    void d;
    const secret = new TextEncoder().encode(JSON.stringify(pub));
    const jws = await new SignJWT({ vc: { id: 'urn:uuid:x', credentialSubject: SUBJECT } })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer(ISSUER)
      .setIssuedAt()
      .sign(secret);

    const result = await verifyCredential({ jws }, { supabase: mockStore(activeRow('urn:uuid:x')) });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('alg_not_allowed');
  });

  it('rejects an expired token', async () => {
    const vc = await issue();
    const future = new Date(Date.now() + 800 * 86400 * 1000);
    const result = await verifyCredential({ jws: vc.proof.jws }, { supabase: mockStore(activeRow(vc.id!)), now: future });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('expired');
  });

  it('rejects a token that is not yet valid (nbf)', async () => {
    const vc = await issue();
    const past = new Date(Date.now() - 3600 * 1000);
    const result = await verifyCredential({ jws: vc.proof.jws }, { supabase: mockStore(activeRow(vc.id!)), now: past });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('not_yet_valid');
  });

  it('reports a revoked credential as invalid with status revoked', async () => {
    const vc = await issue();
    const store = mockStore({
      data: { id: vc.id, status: 'revoked', revoked_at: '2026-01-01T00:00:00Z', revoked_reason: 'Issued in error' },
      error: null,
    });
    const result = await verifyCredential({ jws: vc.proof.jws }, { supabase: store });
    expect(result.valid).toBe(false);
    expect(result.status).toBe('revoked');
    expect(result.reason).toBe('revoked');
    expect(result.revokedReason).toBe('Issued in error');
  });

  it('is fail-closed when the revocation lookup errors', async () => {
    const vc = await issue();
    const store = mockStore({ data: null, error: { code: '42P01', message: 'relation does not exist' } });
    const result = await verifyCredential({ jws: vc.proof.jws }, { supabase: store });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('revocation_check_failed');
    expect(JSON.stringify(result)).not.toContain('relation does not exist');
  });

  it('falls back to status-only when revoked_at/revoked_reason columns are missing', async () => {
    const vc = await issue();
    let calls = 0;
    const store = mockStore(async () => {
      calls += 1;
      return calls === 1
        ? { data: null, error: { code: '42703', message: 'column revoked_at does not exist' } }
        : { data: { id: vc.id, status: 'revoked' }, error: null };
    });
    const result = await verifyCredential({ jws: vc.proof.jws }, { supabase: store });
    expect(calls).toBe(2);
    expect(result.valid).toBe(false);
    expect(result.status).toBe('revoked');
  });

  it('is fail-closed when the lookup throws', async () => {
    const vc = await issue();
    const store = mockStore(async () => {
      throw new Error('network down');
    });
    const result = await verifyCredential({ jws: vc.proof.jws }, { supabase: store });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('revocation_check_failed');
  });

  it('treats a validly signed credential with no database row as unknown', async () => {
    const vc = await issue();
    const result = await verifyCredential({ jws: vc.proof.jws }, { supabase: mockStore({ data: null, error: null }) });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('unknown_credential');
    expect(result.status).toBe('unknown');
  });

  it('rejects an unrecognised status value (fail-closed)', async () => {
    const vc = await issue();
    const store = mockStore({ data: { id: vc.id, status: 'suspended', revoked_at: null, revoked_reason: null }, error: null });
    const result = await verifyCredential({ jws: vc.proof.jws }, { supabase: store });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('inactive');
  });

  it('still verifies a legacy token that has no exp / jti / nbf', async () => {
    const key = await importJWK(privateJwk, alg);
    const id = 'urn:uuid:legacy-1';
    const jws = await new SignJWT({ vc: { id, issuer: ISSUER, credentialSubject: SUBJECT } })
      .setProtectedHeader({ alg, kid: privateJwk.kid })
      .setIssuer(ISSUER)
      .setIssuedAt()
      .sign(key);
    expect(decodeJwt(jws).exp).toBeUndefined();

    const result = await verifyCredential({ jws }, { supabase: mockStore(activeRow(id)) });
    expect(result.valid).toBe(true);
    expect(result.expiresAt).toBeUndefined();
  });

  it('verifies by vcId using the stored credential, and rejects when ids disagree', async () => {
    const vc = await issue();
    const rowWithCred = {
      data: { id: vc.id, status: 'active', revoked_at: null, revoked_reason: null, credential: vc },
      error: null,
    };
    const ok = await verifyCredential({ vcId: vc.id! }, { supabase: mockStore(rowWithCred) });
    expect(ok.valid).toBe(true);

    // Row stored under a different id than the signed one => reject
    const mismatch = await verifyCredential({ vcId: 'urn:uuid:other' }, { supabase: mockStore(rowWithCred) });
    expect(mismatch.valid).toBe(false);
    expect(mismatch.reason).toBe('id_mismatch');
  });

  it('enforces the expected issuer when configured', async () => {
    const vc = await issue();
    const result = await verifyCredential(
      { jws: vc.proof.jws },
      { supabase: mockStore(activeRow(vc.id!)), issuer: 'did:web:someone-else.test' }
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('invalid_claims');
  });

  it('returns missing_input when nothing to verify is given', async () => {
    const result = await verifyCredential({}, { supabase: mockStore({ data: null, error: null }) });
    expect(result).toMatchObject({ valid: false, reason: 'missing_input' });
  });

  it('verifyCredentialJws accepts the private JWK but verifies with the derived public key', async () => {
    const vc = await issue();
    const { payload, protectedHeader } = await verifyCredentialJws(vc.proof.jws, privateJwk);
    expect(protectedHeader.alg).toBe(alg);
    expect(payload.jti).toBe(vc.id);
    const pub = await getIssuerPublicJwk();
    expect(pub).not.toHaveProperty('d');
    await expect(verifyCredentialJws(vc.proof.jws, pub)).resolves.toBeDefined();
  });
});

describe('regression: the old verifyCredentialJws logic', () => {
  it('importJWK(privateJwk) + jwtVerify throws, so every genuine credential used to verify as invalid', async () => {
    const jwk = await makePrivateJwk('EdDSA');
    vi.mocked(getIssuerJwkJson).mockReturnValue(JSON.stringify(jwk));
    const vc = await issue();

    // OLD implementation: const key = await importJWK(jwk, jwk.alg); return jwtVerify(jws, key);
    const oldVerify = async () => {
      const key = await importJWK(jwk, jwk.alg);
      return jwtVerify(vc.proof.jws, key);
    };
    await expect(oldVerify()).rejects.toThrow(/public/i);

    // NEW implementation succeeds for the very same token + key
    await expect(verifyCredentialJws(vc.proof.jws, jwk)).resolves.toBeDefined();
  });

  it('old logic had no algorithm pin: it accepted any alg the (symmetric) key material allowed', async () => {
    // Old code passed no `algorithms` option; the new code pins the key's alg.
    const jwk = await makePrivateJwk('ES256');
    const { d, ...pub } = jwk;
    void d;
    const secret = new TextEncoder().encode(JSON.stringify(pub));
    const hs = await new SignJWT({ vc: { id: 'urn:uuid:x' } }).setProtectedHeader({ alg: 'HS256' }).sign(secret);
    await expect(verifyCredentialJws(hs, jwk)).rejects.toMatchObject({ code: 'ERR_JOSE_ALG_NOT_ALLOWED' });
  });
});
