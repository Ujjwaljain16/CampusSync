/**
 * Test fixtures for the offline verifier: real jose keys, credentials and status lists built
 * WITHOUT any CampusSync server code, so the verifier is tested against the wire format only.
 */
import { generateKeyPair, exportJWK, SignJWT, calculateJwkThumbprint, type JWK } from 'jose';
import { gzipSync } from 'node:zlib';

export const ISSUER = 'did:web:campussync.test';
export const LIST_URL = 'https://campussync.test/api/status/revocation/rev-1';
export const NOW = new Date('2026-06-01T00:00:00Z');
const nowSec = Math.floor(NOW.getTime() / 1000);

export type Alg = 'EdDSA' | 'ES256' | 'RS256';

export interface TestKey {
  alg: Alg;
  kid: string;
  privateKey: CryptoKey;
  publicJwk: JWK;
}

export async function makeKey(alg: Alg = 'EdDSA', kid?: string): Promise<TestKey> {
  const { privateKey, publicKey } = await generateKeyPair(alg, { extractable: true, ...(alg === 'EdDSA' ? { crv: 'Ed25519' } : {}) });
  const pub = await exportJWK(publicKey);
  const k = kid ?? (await calculateJwkThumbprint(pub));
  return { alg, kid: k, privateKey, publicJwk: { ...pub, alg, kid: k, use: 'sig' } };
}

export const jwksOf = (...keys: TestKey[]) => ({ keys: keys.map(k => k.publicJwk) });

export function credentialStatus(index: number, url = LIST_URL) {
  return {
    id: `${url}#${index}`,
    type: 'BitstringStatusListEntry',
    statusPurpose: 'revocation',
    statusListIndex: String(index),
    statusListCredential: url,
  };
}

export interface CredOpts {
  alg?: Alg;
  kid?: string | null; // null => header without kid
  iss?: string;
  iat?: number;
  nbf?: number | null;
  exp?: number | null;
  status?: ReturnType<typeof credentialStatus>;
  id?: string;
  headerExtra?: Record<string, unknown>;
}

export async function signCred(key: TestKey, o: CredOpts = {}): Promise<{ jws: string; id: string }> {
  const id = o.id ?? `urn:uuid:${crypto.randomUUID()}`;
  const iss = o.iss ?? ISSUER;
  const vc = {
    '@context': ['https://www.w3.org/2018/credentials/v1'],
    type: ['VerifiableCredential', 'AchievementCredential'],
    issuer: iss,
    id,
    issuanceDate: NOW.toISOString(),
    credentialSubject: { id: 'student-1', certificateId: 'cert-1', title: 'Intro to Testing', institution: 'Test University', dateIssued: '2025-01-01' },
    ...(o.status ? { credentialStatus: o.status } : {}),
  };
  let b = new SignJWT({ vc })
    .setProtectedHeader({ alg: o.alg ?? key.alg, ...(o.kid === null ? {} : { kid: o.kid ?? key.kid }), ...(o.headerExtra ?? {}) })
    .setIssuer(iss)
    .setJti(id)
    .setSubject('student-1')
    .setIssuedAt(o.iat ?? nowSec - 3600);
  if (o.nbf !== null) b = b.setNotBefore(o.nbf ?? nowSec - 3600);
  if (o.exp !== null) b = b.setExpirationTime(o.exp ?? nowSec + 86400 * 365);
  return { jws: await b.sign(key.privateKey), id };
}

/** index 0 = most significant bit of byte 0 */
export function bitstring(sizeBits: number, setIndexes: number[] = []): Uint8Array {
  const bytes = new Uint8Array(sizeBits / 8);
  for (const i of setIndexes) bytes[i >> 3] |= 1 << (7 - (i & 7));
  return bytes;
}

export const encodeBits = (bytes: Uint8Array) => 'u' + Buffer.from(gzipSync(bytes)).toString('base64url');

export interface ListOpts {
  url?: string;
  iss?: string;
  iat?: number;
  purpose?: string;
  subjectId?: string;
  encodedList?: string;
  kid?: string | null;
}

export async function signList(key: TestKey, bytes: Uint8Array, o: ListOpts = {}): Promise<{ jws: string; id: string; updatedAt: string }> {
  const url = o.url ?? LIST_URL;
  const iss = o.iss ?? ISSUER;
  const vc = {
    '@context': ['https://www.w3.org/2018/credentials/v1'],
    id: url,
    type: ['VerifiableCredential', 'BitstringStatusListCredential'],
    issuer: iss,
    issuanceDate: NOW.toISOString(),
    credentialSubject: {
      id: o.subjectId ?? `${url}#list`,
      type: 'BitstringStatusList',
      statusPurpose: o.purpose ?? 'revocation',
      encodedList: o.encodedList ?? encodeBits(bytes),
    },
  };
  const jws = await new SignJWT({ vc })
    .setProtectedHeader({ alg: key.alg, ...(o.kid === null ? {} : { kid: o.kid ?? key.kid }) })
    .setIssuer(iss)
    .setSubject(url)
    .setIssuedAt(o.iat ?? nowSec - 60)
    .setNotBefore(o.iat ?? nowSec - 60)
    .sign(key.privateKey);
  return { jws, id: url, updatedAt: NOW.toISOString() };
}

/** A fetch() stand-in serving fixed bodies by URL. */
export function fakeFetch(routes: Record<string, unknown | ((url: string) => Response)>) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const f = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    const r = routes[url];
    if (r === undefined) return new Response('not found', { status: 404 });
    if (typeof r === 'function') return (r as (u: string) => Response)(url);
    return new Response(typeof r === 'string' ? r : JSON.stringify(r), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  return { f, calls };
}
