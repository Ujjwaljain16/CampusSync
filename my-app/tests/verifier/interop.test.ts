// @vitest-environment node
/**
 * Server <-> offline verifier interoperability: credentials, status lists, JWKS and the DID
 * document produced by the REAL server code are verified by the standalone verifier module,
 * which shares no code with the server.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { generateKeyPair, exportJWK, type JWK } from 'jose';

vi.mock('@/lib/envServer', () => ({ getIssuerJwkJson: vi.fn() }));

import { getIssuerJwkJson } from '@/lib/envServer';
import { signCredential, toPublicJwk } from '@/lib/vc';
import { allocateStatusEntry, buildStatusListCredential, markCredentialsRevoked, __resetStatusListCursor, loadStatusList } from '@/lib/statusList';
import { GET as jwksGET } from '@/app/.well-known/jwks.json/route';
import { GET as didGET } from '@/app/.well-known/did.json/route';
import { verifyCredentialOffline } from '../../../verifier/src/verify.mjs';
import { createFakeStatusDb } from '../vc/fakeStatusDb';

const DID = 'did:web:campussync.test';
const BASE = 'https://campussync.test';
const SUBJECT = { id: 'student-1', certificateId: 'cert-1', title: 'T', institution: 'I', dateIssued: '2025-01-01' };

async function makeKey(alg: 'EdDSA' | 'ES256' | 'RS256'): Promise<JWK> {
  const { privateKey } = await generateKeyPair(alg, { extractable: true, ...(alg === 'EdDSA' ? { crv: 'Ed25519' } : {}) });
  return { ...(await exportJWK(privateKey)), alg };
}

const setKey = (k: JWK) => vi.mocked(getIssuerJwkJson).mockReturnValue(JSON.stringify(k));

beforeEach(() => {
  process.env.NEXT_PUBLIC_BASE_URL = BASE;
  process.env.NEXT_PUBLIC_ISSUER_DID = DID;
  process.env.VC_STATUS_LIST_ENABLED = 'true';
  delete process.env.VC_ISSUER_PREVIOUS_PUBLIC_JWKS;
  __resetStatusListCursor();
});
afterEach(() => {
  for (const k of ['NEXT_PUBLIC_BASE_URL', 'NEXT_PUBLIC_ISSUER_DID', 'VC_STATUS_LIST_ENABLED', 'VC_ISSUER_PREVIOUS_PUBLIC_JWKS']) delete process.env[k];
});

describe.each(['EdDSA', 'ES256', 'RS256'] as const)('server-issued credentials verify offline (%s)', alg => {
  it('end to end: issue, verify via JWKS, revoke, status list flips the offline result', async () => {
    setKey(await makeKey(alg));
    const db = createFakeStatusDb();
    const slot = (await allocateStatusEntry(db.client))!;
    const vc = await signCredential({ issuerDid: DID, credentialStatus: slot.entry, credential: { credentialSubject: SUBJECT } });

    const jwks = await (await jwksGET()).json();
    const serveList = async () => {
      const l = (await loadStatusList(slot.listId, db.client))!;
      return buildStatusListCredential({ id: slot.listUrl, purpose: 'revocation', bits: l.bytes, issuerDid: DID, updatedAt: l.updatedAt });
    };

    const before = await verifyCredentialOffline(vc, { jwks, statusListFetch: async () => serveList() });
    expect(before).toMatchObject({ valid: true, revoked: false, issuer: DID, credentialId: vc.id, subject: 'student-1' });

    await markCredentialsRevoked([{ credential: vc }], db.client);
    const after = await verifyCredentialOffline(vc, { jwks, statusListFetch: async () => serveList() });
    expect(after).toMatchObject({ valid: false, revoked: true, reason: 'revoked' });
  });
});

describe('rotation, DID document and the verifier', () => {
  it('after rotation the old credential verifies against the published JWKS and the DID document', async () => {
    const oldKey = await makeKey('EdDSA');
    setKey(oldKey);
    const oldVc = await signCredential({ issuerDid: DID, credential: { credentialSubject: SUBJECT } });

    setKey(await makeKey('EdDSA'));
    process.env.VC_ISSUER_PREVIOUS_PUBLIC_JWKS = JSON.stringify([toPublicJwk(oldKey)]);
    const newVc = await signCredential({ issuerDid: DID, credential: { credentialSubject: SUBJECT } });

    const jwks = await (await jwksGET()).json();
    const doc = await (await didGET(new Request(`${BASE}/.well-known/did.json`, { headers: { host: 'campussync.test' } }))).json();

    for (const vc of [oldVc, newVc]) {
      expect((await verifyCredentialOffline(vc, { jwks, expectedIssuer: DID })).valid).toBe(true);
      expect((await verifyCredentialOffline(vc, { didDocument: doc, expectedIssuer: DID })).valid).toBe(true);
    }
    // the proof's verificationMethod names a method of the DID document
    const ids = doc.verificationMethod.map((v: { id: string }) => v.id);
    expect(ids).toContain(oldVc.proof.verificationMethod);
    expect(ids).toContain(newVc.proof.verificationMethod);
    // without the previous key published, the old credential no longer verifies
    expect((await verifyCredentialOffline(oldVc, { jwks: { keys: [jwks.keys[0]] } })).reason).toBe('unknown_key');
  });

  it('works end to end through fetch: derives <issuer>/.well-known/jwks.json from the credential', async () => {
    setKey(await makeKey('EdDSA'));
    const vc = await signCredential({ issuerDid: DID, credential: { credentialSubject: SUBJECT } });
    const jwksBody = JSON.stringify(await (await jwksGET()).json());
    const fetchImpl = (async (url: string) => {
      expect(url).toBe(`${BASE}/.well-known/jwks.json`);
      return new Response(jwksBody, { status: 200 });
    }) as unknown as typeof fetch;
    expect((await verifyCredentialOffline(vc, { fetch: fetchImpl })).valid).toBe(true);
  });
});
