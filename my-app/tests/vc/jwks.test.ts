// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { generateKeyPair, exportJWK, importJWK, jwtVerify, type JWK } from 'jose';

vi.mock('@/lib/envServer', () => ({
  getIssuerJwkJson: vi.fn(),
}));

import { getIssuerJwkJson } from '@/lib/envServer';
import { signCredential, toPublicJwk } from '@/lib/vc';
import { GET } from '@/app/.well-known/jwks.json/route';

const PRIVATE_MEMBERS = ['d', 'p', 'q', 'dp', 'dq', 'qi', 'k', 'oth'];

describe('/.well-known/jwks.json', () => {
  let privateJwk: JWK;

  beforeEach(async () => {
    const { privateKey } = await generateKeyPair('ES256', { extractable: true });
    privateJwk = { ...(await exportJWK(privateKey)), alg: 'ES256', kid: 'jwks-key' };
    vi.mocked(getIssuerJwkJson).mockReturnValue(JSON.stringify(privateJwk));
  });

  it('returns only public members, with kid/alg/use and a public cache header', async () => {
    expect(privateJwk.d).toBeDefined();
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('public, max-age=300');

    const body = await res.json();
    expect(body.keys).toHaveLength(1);
    const key = body.keys[0];
    for (const m of PRIVATE_MEMBERS) expect(key).not.toHaveProperty(m);
    expect(key).toMatchObject({ kty: 'EC', crv: 'P-256', kid: 'jwks-key', alg: 'ES256', use: 'sig' });
    expect(JSON.stringify(body)).not.toContain(privateJwk.d as string);
  });

  it('the published key verifies credentials signed by the private key', async () => {
    const vc = await signCredential({
      issuerDid: 'did:web:campussync.test',
      verificationMethod: 'did:web:campussync.test#keys-1',
      credential: { credentialSubject: { id: 'sub-1', certificateId: 'c', title: 't', institution: 'i', dateIssued: '2025-01-01' } },
    });
    const { keys } = await (await GET()).json();
    const pub = await importJWK(keys[0], 'ES256');
    const { payload } = await jwtVerify(vc.proof.jws, pub, { algorithms: ['ES256'] });
    expect(payload.jti).toBe(vc.id);
  });

  it('returns 503 when the key is a development placeholder', async () => {
    vi.mocked(getIssuerJwkJson).mockReturnValue(
      JSON.stringify({ kty: 'RSA', alg: 'RS256', n: 'placeholder-n-value-for-development', e: 'AQAB', d: 'x' })
    );
    const res = await GET();
    expect(res.status).toBe(503);
    expect(JSON.stringify(await res.json())).not.toContain('"d"');
  });

  it('returns 503 when the key is missing or unusable', async () => {
    vi.mocked(getIssuerJwkJson).mockImplementation(() => {
      throw new Error('Missing required server environment variables: VC_ISSUER_JWK');
    });
    expect((await GET()).status).toBe(503);

    vi.mocked(getIssuerJwkJson).mockReturnValue(JSON.stringify({ kty: 'EC', crv: 'P-256', x: 'a', y: 'b' })); // no alg
    expect((await GET()).status).toBe(503);
  });
});

describe('toPublicJwk', () => {
  it('strips private members for RSA, EC and OKP keys', () => {
    const rsa = toPublicJwk({ kty: 'RSA', n: 'n', e: 'e', d: 'd', p: 'p', q: 'q', dp: 'dp', dq: 'dq', qi: 'qi', alg: 'RS256' });
    const ec = toPublicJwk({ kty: 'EC', crv: 'P-256', x: 'x', y: 'y', d: 'd', alg: 'ES256' });
    const okp = toPublicJwk({ kty: 'OKP', crv: 'Ed25519', x: 'x', d: 'd', alg: 'EdDSA' });
    for (const k of [rsa, ec, okp]) for (const m of PRIVATE_MEMBERS) expect(k).not.toHaveProperty(m);
    expect(rsa).toMatchObject({ n: 'n', e: 'e' });
    expect(ec).toMatchObject({ x: 'x', y: 'y' });
    expect(okp).toMatchObject({ x: 'x' });
  });

  it('rejects symmetric / unknown key types', () => {
    expect(() => toPublicJwk({ kty: 'oct', k: 'secret' })).toThrow();
  });
});
