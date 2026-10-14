// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { generateKeyPair, exportJWK, importJWK, jwtVerify, type JWK } from 'jose';

vi.mock('@/lib/envServer', () => ({
  getIssuerJwkJson: vi.fn(),
}));

import { getIssuerJwkJson } from '@/lib/envServer';
import { signCredential, toPublicJwk } from '@/lib/vc';
import { GET } from '@/app/.well-known/did.json/route';

const DID = 'did:web:campussync.test';
const PRIVATE_MEMBERS = ['d', 'p', 'q', 'dp', 'dq', 'qi', 'k', 'oth'];

const call = (headers: Record<string, string> = { host: 'campussync.test' }) =>
  GET(new Request('https://campussync.test/.well-known/did.json', { headers }));

async function makeKey(alg: 'EdDSA' | 'ES256', kid?: string): Promise<JWK> {
  const { privateKey } = await generateKeyPair(alg, { extractable: true, ...(alg === 'EdDSA' ? { crv: 'Ed25519' } : {}) });
  return { ...(await exportJWK(privateKey)), alg, ...(kid ? { kid } : {}) };
}

let current: JWK;

beforeEach(async () => {
  current = await makeKey('EdDSA'); // no kid: thumbprint
  vi.mocked(getIssuerJwkJson).mockReturnValue(JSON.stringify(current));
  process.env.NEXT_PUBLIC_ISSUER_DID = DID;
  delete process.env.VC_ISSUER_PREVIOUS_PUBLIC_JWKS;
});
afterEach(() => {
  delete process.env.NEXT_PUBLIC_ISSUER_DID;
  delete process.env.VC_ISSUER_PREVIOUS_PUBLIC_JWKS;
});

describe('/.well-known/did.json', () => {
  it('returns a DID document with did + jws-2020 contexts, JsonWebKey2020 methods and no private members', async () => {
    const res = await call();
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('public, max-age=300');
    const doc = await res.json();

    expect(doc['@context']).toEqual(['https://www.w3.org/ns/did/v1', 'https://w3id.org/security/suites/jws-2020/v1']);
    expect(doc.id).toBe(DID);
    expect(doc.verificationMethod).toHaveLength(1);
    const vm = doc.verificationMethod[0];
    expect(vm).toMatchObject({ type: 'JsonWebKey2020', controller: DID });
    expect(vm.id).toBe(`${DID}#${vm.publicKeyJwk.kid}`);
    expect(vm.publicKeyJwk).toMatchObject({ kty: 'OKP', crv: 'Ed25519', alg: 'EdDSA', use: 'sig' });
    expect(doc.assertionMethod).toEqual([vm.id]);

    for (const m of PRIVATE_MEMBERS) expect(vm.publicKeyJwk).not.toHaveProperty(m);
    expect(JSON.stringify(doc)).not.toContain(current.d as string);
  });

  it('lists previous keys too (current first)', async () => {
    const old = await makeKey('ES256');
    process.env.VC_ISSUER_PREVIOUS_PUBLIC_JWKS = JSON.stringify([toPublicJwk(old)]);
    const doc = await (await call()).json();
    expect(doc.verificationMethod).toHaveLength(2);
    expect(doc.verificationMethod[0].publicKeyJwk.alg).toBe('EdDSA');
    expect(doc.verificationMethod[1].publicKeyJwk.alg).toBe('ES256');
    expect(doc.assertionMethod).toEqual(doc.verificationMethod.map((v: { id: string }) => v.id));
  });

  it('the issued credential verificationMethod resolves to a key in the document that verifies its JWS', async () => {
    const vc = await signCredential({
      issuerDid: DID,
      credential: { credentialSubject: { id: 'sub', certificateId: 'c', title: 't', institution: 'i', dateIssued: '2025-01-01' } },
    });
    const doc = await (await call()).json();
    const method = doc.verificationMethod.find((v: { id: string }) => v.id === vc.proof.verificationMethod);
    expect(method).toBeDefined();
    expect(assertionIds(doc)).toContain(vc.proof.verificationMethod);

    const key = await importJWK(method.publicKeyJwk, 'EdDSA');
    const { payload } = await jwtVerify(vc.proof.jws, key, { algorithms: ['EdDSA'], issuer: DID });
    expect(payload.jti).toBe(vc.id);
  });

  it('serves when the request host matches (including ports / forwarded host) and when no host header exists', async () => {
    expect((await call({ host: 'CampusSync.test' })).status).toBe(200);
    expect((await call({ 'x-forwarded-host': 'campussync.test', host: 'internal:3000' })).status).toBe(200);
    expect((await call({})).status).toBe(200);

    process.env.NEXT_PUBLIC_ISSUER_DID = 'did:web:localhost%3A3000';
    expect((await call({ host: 'localhost:3000' })).status).toBe(200);
  });

  it('404 for another host, a path-style did:web, or a non did:web identifier', async () => {
    expect((await call({ host: 'evil.test' })).status).toBe(404);
    process.env.NEXT_PUBLIC_ISSUER_DID = 'did:web:campussync.test:issuers:one';
    expect((await call()).status).toBe(404);
    process.env.NEXT_PUBLIC_ISSUER_DID = 'did:key:z6Mk';
    expect((await call()).status).toBe(404);
  });

  it('503 when the DID is missing or a placeholder, or the issuer key is missing / a placeholder', async () => {
    delete process.env.NEXT_PUBLIC_ISSUER_DID;
    expect((await call()).status).toBe(503);
    process.env.NEXT_PUBLIC_ISSUER_DID = 'did:web:your-domain.example';
    expect((await call({})).status).toBe(503);

    process.env.NEXT_PUBLIC_ISSUER_DID = DID;
    vi.mocked(getIssuerJwkJson).mockReturnValue(
      JSON.stringify({ kty: 'RSA', alg: 'RS256', n: 'placeholder-n-value-for-development', e: 'AQAB', d: 'x' })
    );
    const res = await call();
    expect(res.status).toBe(503);
    expect(JSON.stringify(await res.json())).not.toContain('"d"');

    vi.mocked(getIssuerJwkJson).mockImplementation(() => {
      throw new Error('Missing required server environment variables: VC_ISSUER_JWK');
    });
    expect((await call()).status).toBe(503);
  });
});

function assertionIds(doc: { assertionMethod: string[] }) {
  return doc.assertionMethod;
}
