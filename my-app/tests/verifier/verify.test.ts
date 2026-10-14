// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { gzipSync } from 'node:zlib';
import { verifyCredentialOffline, extractJws, jwksUrlFromDid, decodeEncodedList, getStatusBit, keysFromDidDocument, REASONS } from '../../../verifier/src/verify.mjs';
import {
  ISSUER,
  LIST_URL,
  NOW,
  bitstring,
  credentialStatus,
  encodeBits,
  fakeFetch,
  jwksOf,
  makeKey,
  signCred,
  signList,
} from './helpers';

const checkOf = (r: { checks: Array<{ id: string; ok: boolean }> }, id: string) => r.checks.find(c => c.id === id);

describe('signature, algorithm and key selection', () => {
  it.each(['EdDSA', 'ES256', 'RS256'] as const)('verifies a %s credential offline with a supplied JWKS', async alg => {
    const key = await makeKey(alg);
    const { jws, id } = await signCred(key);
    const r = await verifyCredentialOffline(jws, { jwks: jwksOf(key), now: NOW });
    expect(r).toMatchObject({ valid: true, reason: 'ok', signatureVerified: true, issuer: ISSUER, subject: 'student-1', credentialId: id, keyId: key.kid, revoked: null });
    expect(r.expiresAt).toBeTruthy();
    expect(r.checks.map(c => c.id)).toEqual(['format', 'algorithm', 'key_source', 'key', 'signature', 'validity', 'issuer', 'payload', 'status']);
    expect(r.checks.every(c => c.ok)).toBe(true);
  });

  it('accepts a credential object, a JSON string and an API envelope containing proof.jws', async () => {
    const key = await makeKey();
    const { jws } = await signCred(key);
    const opts = { jwks: jwksOf(key), now: NOW };
    expect((await verifyCredentialOffline({ proof: { jws } }, opts)).valid).toBe(true);
    expect((await verifyCredentialOffline(JSON.stringify({ proof: { jws } }), opts)).valid).toBe(true);
    expect((await verifyCredentialOffline({ success: true, data: { proof: { jws } } }, opts)).valid).toBe(true);
    expect(extractJws('  ' + jws + '\n')).toBe(jws);
    expect(extractJws({ nothing: 1 })).toBeNull();
    expect(extractJws('{not json')).toBeNull();
  });

  it('selects the key by kid among several (rotation): old and new credentials both verify', async () => {
    const oldKey = await makeKey('ES256');
    const newKey = await makeKey('EdDSA');
    const jwks = jwksOf(newKey, oldKey);
    expect((await verifyCredentialOffline((await signCred(oldKey)).jws, { jwks, now: NOW })).keyId).toBe(oldKey.kid);
    expect((await verifyCredentialOffline((await signCred(newKey)).jws, { jwks, now: NOW })).keyId).toBe(newKey.kid);
  });

  it('unknown kid fails (no fallback to another key)', async () => {
    const key = await makeKey();
    const { jws } = await signCred(key, { kid: 'some-other-kid' });
    const r = await verifyCredentialOffline(jws, { jwks: jwksOf(key), now: NOW });
    expect(r).toMatchObject({ valid: false, reason: REASONS.UNKNOWN_KEY, signatureVerified: false });
    expect(r.issuer).toBeUndefined(); // nothing unverified is reported as a signed field
  });

  it('token without a kid is tried against every compatible key', async () => {
    const a = await makeKey('EdDSA');
    const b = await makeKey('EdDSA');
    const { jws } = await signCred(b, { kid: null });
    const r = await verifyCredentialOffline(jws, { jwks: jwksOf(a, b), now: NOW });
    expect(r).toMatchObject({ valid: true, keyId: b.kid });
  });

  it('a signature by another key under a known kid fails', async () => {
    const real = await makeKey('EdDSA', 'k1');
    const attacker = await makeKey('EdDSA', 'k1');
    const { jws } = await signCred(attacker);
    expect(await verifyCredentialOffline(jws, { jwks: jwksOf(real), now: NOW })).toMatchObject({ valid: false, reason: REASONS.INVALID_SIGNATURE });
  });

  it('a tampered payload fails', async () => {
    const key = await makeKey();
    const { jws } = await signCred(key);
    const [h, p, s] = jws.split('.');
    const payload = JSON.parse(Buffer.from(p, 'base64url').toString());
    payload.vc.credentialSubject.title = 'FORGED';
    const forged = [h, Buffer.from(JSON.stringify(payload)).toString('base64url'), s].join('.');
    expect(await verifyCredentialOffline(forged, { jwks: jwksOf(key), now: NOW })).toMatchObject({ valid: false, reason: REASONS.INVALID_SIGNATURE });
  });

  it('rejects alg none, HS256 (key confusion) and unlisted algorithms before any key work', async () => {
    const key = await makeKey();
    const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const body = b64({ iss: ISSUER, vc: { id: 'x', credentialSubject: {} } });
    for (const alg of ['none', 'HS256', 'ES512', 'PS256']) {
      const token = `${b64({ alg, typ: 'JWT' })}.${body}.${alg === 'none' ? '' : 'c2ln'}`;
      const r = await verifyCredentialOffline(token, { jwks: jwksOf(key), now: NOW });
      expect(r).toMatchObject({ valid: false, reason: REASONS.ALG_NOT_ALLOWED });
    }
  });

  it('a key whose declared alg differs from the token alg is not used', async () => {
    const ed = await makeKey('EdDSA', 'same');
    const { jws } = await signCred(ed);
    const wrong = { keys: [{ ...ed.publicJwk, alg: 'ES256' }] };
    expect((await verifyCredentialOffline(jws, { jwks: wrong, now: NOW })).valid).toBe(false);
  });

  it('ignores symmetric keys in a JWKS and refuses an unusable JWKS', async () => {
    const key = await makeKey();
    const { jws } = await signCred(key);
    const withOct = { keys: [{ kty: 'oct', k: 'AAAA', kid: key.kid }, key.publicJwk] };
    expect((await verifyCredentialOffline(jws, { jwks: withOct, now: NOW })).valid).toBe(true);
    expect(await verifyCredentialOffline(jws, { jwks: { keys: [{ kty: 'oct', k: 'AAAA' }] }, now: NOW })).toMatchObject({ reason: REASONS.JWKS_INVALID });
    expect(await verifyCredentialOffline(jws, { jwks: {} as never, now: NOW })).toMatchObject({ reason: REASONS.JWKS_INVALID });
  });

  it('private members in a supplied JWKS are never used (public members only are copied)', async () => {
    const key = await makeKey();
    const { jws } = await signCred(key);
    const r = await verifyCredentialOffline(jws, { jwks: { keys: [{ ...key.publicJwk, d: 'ignored' }] }, now: NOW });
    expect(r.valid).toBe(true);
  });

  it('never trusts keys embedded in the token header (jwk / jku)', async () => {
    const attacker = await makeKey('EdDSA', 'k1');
    const real = await makeKey('EdDSA', 'k1');
    const { jws } = await signCred(attacker, { headerExtra: { jwk: attacker.publicJwk, jku: 'https://evil.test/jwks.json' } });
    const f = fakeFetch({});
    const r = await verifyCredentialOffline(jws, { jwks: jwksOf(real), now: NOW, fetch: f.f });
    expect(r).toMatchObject({ valid: false, reason: REASONS.INVALID_SIGNATURE });
    expect(f.calls).toHaveLength(0);
  });

  it('malformed and empty input', async () => {
    expect(await verifyCredentialOffline('', {})).toMatchObject({ valid: false, reason: REASONS.MISSING_INPUT });
    expect(await verifyCredentialOffline(undefined, {})).toMatchObject({ reason: REASONS.MISSING_INPUT });
    expect(await verifyCredentialOffline('not a jws', {})).toMatchObject({ reason: REASONS.MALFORMED_TOKEN });
    expect(await verifyCredentialOffline('a.b.c', {})).toMatchObject({ reason: REASONS.MALFORMED_TOKEN });
    expect(await verifyCredentialOffline({ foo: 1 }, {})).toMatchObject({ reason: REASONS.MALFORMED_TOKEN });
  });
});

describe('claims', () => {
  it('expired and not-yet-valid, honouring clock tolerance and an injected clock', async () => {
    const key = await makeKey();
    const nowSec = Math.floor(NOW.getTime() / 1000);
    const expired = await signCred(key, { exp: nowSec - 3600 });
    const future = await signCred(key, { nbf: nowSec + 3600, iat: nowSec });
    const opts = { jwks: jwksOf(key), now: NOW };
    expect(await verifyCredentialOffline(expired.jws, opts)).toMatchObject({ valid: false, reason: REASONS.EXPIRED, signatureVerified: true });
    expect(await verifyCredentialOffline(future.jws, opts)).toMatchObject({ valid: false, reason: REASONS.NOT_YET_VALID });
    // inside tolerance
    const justExpired = await signCred(key, { exp: nowSec - 10 });
    expect((await verifyCredentialOffline(justExpired.jws, opts)).valid).toBe(true);
    expect((await verifyCredentialOffline(justExpired.jws, { ...opts, clockToleranceSec: 0 })).reason).toBe(REASONS.EXPIRED);
    // moving the clock
    const ok = await signCred(key);
    expect((await verifyCredentialOffline(ok.jws, { ...opts, now: new Date('2030-01-01') })).reason).toBe(REASONS.EXPIRED);
    expect((await verifyCredentialOffline(ok.jws, { ...opts, now: new Date(NOW.getTime() - 86400000 * 30) })).reason).toBe(REASONS.NOT_YET_VALID);
    expect(checkOf(await verifyCredentialOffline(expired.jws, opts), 'validity')).toMatchObject({ ok: false });
  });

  it('legacy credentials without exp still verify', async () => {
    const key = await makeKey();
    const { jws } = await signCred(key, { exp: null, nbf: null });
    expect(await verifyCredentialOffline(jws, { jwks: jwksOf(key), now: NOW })).toMatchObject({ valid: true, expiresAt: undefined });
  });

  it('expectedIssuer pins the issuer', async () => {
    const key = await makeKey();
    const { jws } = await signCred(key);
    const opts = { jwks: jwksOf(key), now: NOW };
    expect((await verifyCredentialOffline(jws, { ...opts, expectedIssuer: ISSUER })).valid).toBe(true);
    expect(await verifyCredentialOffline(jws, { ...opts, expectedIssuer: 'did:web:other.test' })).toMatchObject({ valid: false, reason: REASONS.ISSUER_MISMATCH });
  });

  it('rejects payloads that are not a credential with an id and subject, or whose jti disagrees', async () => {
    const key = await makeKey();
    const { SignJWT } = await import('jose');
    const mk = (payload: Record<string, unknown>) => new SignJWT(payload).setProtectedHeader({ alg: 'EdDSA', kid: key.kid }).setIssuer(ISSUER).sign(key.privateKey);
    const opts = { jwks: jwksOf(key), now: NOW };
    expect(await verifyCredentialOffline(await mk({}), opts)).toMatchObject({ reason: REASONS.INVALID_PAYLOAD });
    expect(await verifyCredentialOffline(await mk({ vc: { id: 'x' } }), opts)).toMatchObject({ reason: REASONS.INVALID_PAYLOAD });
    expect(await verifyCredentialOffline(await mk({ jti: 'other', vc: { id: 'x', credentialSubject: { id: 's' } } }), opts)).toMatchObject({ reason: REASONS.INVALID_PAYLOAD });
    expect(await verifyCredentialOffline(await mk({ vc: { id: 'x', issuer: 'did:web:evil.test', credentialSubject: { id: 's' } } }), opts)).toMatchObject({ reason: REASONS.ISSUER_MISMATCH });
  });
});

describe('key sources', () => {
  it('did document: uses only assertionMethod keys, binds the document id to the issuer', async () => {
    const key = await makeKey();
    const other = await makeKey();
    const { jws } = await signCred(key);
    const doc = {
      id: ISSUER,
      verificationMethod: [
        { id: `${ISSUER}#${key.kid}`, type: 'JsonWebKey2020', controller: ISSUER, publicKeyJwk: key.publicJwk },
        { id: `${ISSUER}#${other.kid}`, type: 'JsonWebKey2020', controller: ISSUER, publicKeyJwk: other.publicJwk },
      ],
      assertionMethod: [`${ISSUER}#${key.kid}`],
    };
    expect((await verifyCredentialOffline(jws, { didDocument: doc, now: NOW })).valid).toBe(true);
    // a credential signed by a key that is NOT an assertionMethod is refused
    const bad = (await signCred(other)).jws;
    expect((await verifyCredentialOffline(bad, { didDocument: doc, now: NOW })).reason).toBe(REASONS.UNKNOWN_KEY);
    // wrong document
    expect(await verifyCredentialOffline(jws, { didDocument: { ...doc, id: 'did:web:other.test' }, now: NOW })).toMatchObject({ reason: REASONS.ISSUER_MISMATCH });
    expect(() => keysFromDidDocument({ id: 'x' })).toThrow();
  });

  it('fetches <issuer>/.well-known/jwks.json when only the credential is given (host derived from iss)', async () => {
    const key = await makeKey();
    const { jws } = await signCred(key);
    const url = 'https://campussync.test/.well-known/jwks.json';
    const f = fakeFetch({ [url]: jwksOf(key) });
    const r = await verifyCredentialOffline(jws, { fetch: f.f, now: NOW });
    expect(r.valid).toBe(true);
    expect(f.calls.map(c => c.url)).toEqual([url]);
    expect(f.calls[0].init).toMatchObject({ method: 'GET', redirect: 'manual', credentials: 'omit' });
    expect(checkOf(r, 'key_source')).toMatchObject({ detail: expect.stringContaining('unverified') });
  });

  it('an explicit jwksUrl is used as given', async () => {
    const key = await makeKey();
    const { jws } = await signCred(key);
    const f = fakeFetch({ 'https://keys.example/jwks.json': jwksOf(key) });
    expect((await verifyCredentialOffline(jws, { jwksUrl: 'https://keys.example/jwks.json', fetch: f.f, now: NOW })).valid).toBe(true);
  });

  it('no key source when the issuer is not a host-only did:web', async () => {
    const key = await makeKey();
    const { jws } = await signCred(key, { iss: 'did:key:z6Mk' });
    expect(await verifyCredentialOffline(jws, { now: NOW })).toMatchObject({ reason: REASONS.NO_KEY_SOURCE });
  });

  it('jwksUrlFromDid only handles host-only did:web', () => {
    expect(jwksUrlFromDid('did:web:uni.example')).toBe('https://uni.example/.well-known/jwks.json');
    expect(jwksUrlFromDid('did:web:localhost%3A3000')).toBe('https://localhost:3000/.well-known/jwks.json');
    for (const bad of ['did:web:uni.example:path', 'did:key:abc', 'did:web:bad host', 'did:web:a/b', undefined]) {
      expect(jwksUrlFromDid(bad as string)).toBeNull();
    }
  });
});

describe('fetch constraints (https only, timeout, size cap, redirects)', () => {
  const key = makeKey();
  const jwksUrl = 'https://keys.example/jwks.json';

  it('refuses non-https and credentialed URLs without fetching', async () => {
    const k = await key;
    const { jws } = await signCred(k);
    const f = fakeFetch({});
    for (const u of ['http://keys.example/jwks.json', 'ftp://keys.example/x', 'https://user:pw@keys.example/jwks.json', 'javascript:alert(1)']) {
      expect(await verifyCredentialOffline(jws, { jwksUrl: u, fetch: f.f, now: NOW })).toMatchObject({ valid: false, reason: REASONS.KEY_FETCH_FAILED });
    }
    expect(f.calls).toHaveLength(0);
    // http is only possible by explicit opt-in (local testing)
    const ok = fakeFetch({ 'http://localhost:3000/.well-known/jwks.json': jwksOf(k) });
    expect((await verifyCredentialOffline(jws, { jwksUrl: 'http://localhost:3000/.well-known/jwks.json', allowInsecureHttp: true, fetch: ok.f, now: NOW })).valid).toBe(true);
  });

  it('enforces the 1 MB size cap (declared and streamed)', async () => {
    const k = await key;
    const { jws } = await signCred(k);
    const big = 'x'.repeat(1_000_001);
    const f1 = fakeFetch({ [jwksUrl]: () => new Response(big, { status: 200 }) });
    expect(await verifyCredentialOffline(jws, { jwksUrl, fetch: f1.f, now: NOW })).toMatchObject({ reason: REASONS.KEY_FETCH_FAILED });
    const f2 = fakeFetch({ [jwksUrl]: () => new Response('{}', { status: 200, headers: { 'content-length': '5000000' } }) });
    expect(await verifyCredentialOffline(jws, { jwksUrl, fetch: f2.f, now: NOW })).toMatchObject({ reason: REASONS.KEY_FETCH_FAILED });
    const f3 = fakeFetch({ [jwksUrl]: () => new Response('x'.repeat(2000), { status: 200 }) });
    expect(await verifyCredentialOffline(jws, { jwksUrl, fetch: f3.f, maxBytes: 1000, now: NOW })).toMatchObject({ reason: REASONS.KEY_FETCH_FAILED });
  });

  it('times out after the configured time', async () => {
    const k = await key;
    const { jws } = await signCred(k);
    const hang = (async (_u: unknown, init?: RequestInit) =>
      new Promise((_res, rej) => init?.signal?.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' }))))) as unknown as typeof fetch;
    const t0 = Date.now();
    const r = await verifyCredentialOffline(jws, { jwksUrl, fetch: hang, timeoutMs: 50, now: NOW });
    expect(r).toMatchObject({ valid: false, reason: REASONS.KEY_FETCH_FAILED });
    expect(checkOf(r, 'key_source')).toMatchObject({ detail: 'Request timed out' });
    expect(Date.now() - t0).toBeLessThan(2000);
  });

  it('follows https redirects (max 3) but never to http, and refuses opaque redirects', async () => {
    const k = await key;
    const { jws } = await signCred(k);
    const redirect = (to: string) => () => new Response(null, { status: 302, headers: { location: to } });
    const ok = fakeFetch({ [jwksUrl]: redirect('https://cdn.example/jwks.json'), 'https://cdn.example/jwks.json': jwksOf(k) });
    expect((await verifyCredentialOffline(jws, { jwksUrl, fetch: ok.f, now: NOW })).valid).toBe(true);

    const toHttp = fakeFetch({ [jwksUrl]: redirect('http://evil.example/jwks.json'), 'http://evil.example/jwks.json': jwksOf(k) });
    expect(await verifyCredentialOffline(jws, { jwksUrl, fetch: toHttp.f, now: NOW })).toMatchObject({ reason: REASONS.KEY_FETCH_FAILED });
    expect(toHttp.calls.map(c => c.url)).toEqual([jwksUrl]); // the http hop was never requested

    const loop = fakeFetch({ [jwksUrl]: redirect(jwksUrl) });
    expect(await verifyCredentialOffline(jws, { jwksUrl, fetch: loop.f, now: NOW })).toMatchObject({ reason: REASONS.KEY_FETCH_FAILED });
    expect(loop.calls.length).toBeLessThanOrEqual(4);

    const opaque = (async () => ({ type: 'opaqueredirect', status: 0, ok: false, headers: new Headers() })) as unknown as typeof fetch;
    expect(await verifyCredentialOffline(jws, { jwksUrl, fetch: opaque, now: NOW })).toMatchObject({ reason: REASONS.KEY_FETCH_FAILED });
  });

  it('HTTP errors and non-JSON bodies are reported without raw error text', async () => {
    const k = await key;
    const { jws } = await signCred(k);
    const f404 = fakeFetch({});
    expect(await verifyCredentialOffline(jws, { jwksUrl, fetch: f404.f, now: NOW })).toMatchObject({ reason: REASONS.KEY_FETCH_FAILED });
    const fHtml = fakeFetch({ [jwksUrl]: '<html>nope</html>' });
    expect(await verifyCredentialOffline(jws, { jwksUrl, fetch: fHtml.f, now: NOW })).toMatchObject({ reason: REASONS.JWKS_INVALID });
    const fThrow = (async () => {
      throw new Error('secret internal message');
    }) as unknown as typeof fetch;
    const r = await verifyCredentialOffline(jws, { jwksUrl, fetch: fThrow, now: NOW });
    expect(JSON.stringify(r)).not.toContain('secret internal message');
  });
});

describe('revocation status list', () => {
  async function scenario(opts: { index?: number; revokedIndexes?: number[]; sizeBits?: number } = {}) {
    const key = await makeKey();
    const index = opts.index ?? 5;
    const { jws } = await signCred(key, { status: credentialStatus(index) });
    const list = await signList(key, bitstring(opts.sizeBits ?? 131072, opts.revokedIndexes ?? []));
    return { key, jws, list, index, base: { jwks: jwksOf(key), now: NOW, statusListFetch: async () => list } };
  }

  it('valid when the bit is clear (list supplied through statusListFetch)', async () => {
    const s = await scenario();
    const r = await verifyCredentialOffline(s.jws, s.base);
    expect(r).toMatchObject({ valid: true, revoked: false, statusList: { url: LIST_URL, index: 5 } });
    expect(checkOf(r, 'status')).toMatchObject({ ok: true });
  });

  it('revoked when the bit is set; neighbouring bits do not matter', async () => {
    const s = await scenario({ revokedIndexes: [5] });
    expect(await verifyCredentialOffline(s.jws, s.base)).toMatchObject({ valid: false, revoked: true, reason: REASONS.REVOKED, signatureVerified: true });
    const neighbours = await scenario({ revokedIndexes: [4, 6, 0, 131071] });
    expect(await verifyCredentialOffline(neighbours.jws, neighbours.base)).toMatchObject({ valid: true, revoked: false });
  });

  it('fetches the list itself over https and accepts the {jws,id,updatedAt} envelope or a bare JWS', async () => {
    const s = await scenario({ revokedIndexes: [5] });
    const f = fakeFetch({ [LIST_URL]: s.list });
    expect(await verifyCredentialOffline(s.jws, { jwks: s.base.jwks, now: NOW, fetch: f.f })).toMatchObject({ reason: REASONS.REVOKED });
    const f2 = fakeFetch({ [LIST_URL]: s.list.jws });
    expect(await verifyCredentialOffline(s.jws, { jwks: s.base.jwks, now: NOW, fetch: f2.f })).toMatchObject({ reason: REASONS.REVOKED });
  });

  it('fails closed when the list cannot be obtained', async () => {
    const s = await scenario();
    const f = fakeFetch({}); // 404
    expect(await verifyCredentialOffline(s.jws, { jwks: s.base.jwks, now: NOW, fetch: f.f })).toMatchObject({ valid: false, reason: REASONS.STATUS_LIST_UNAVAILABLE });
    const boom = async () => {
      throw new Error('x');
    };
    expect(await verifyCredentialOffline(s.jws, { ...s.base, statusListFetch: boom })).toMatchObject({ valid: false, reason: REASONS.STATUS_LIST_UNAVAILABLE });
  });

  it('checkStatus:false skips the list (signature-only) and says so', async () => {
    const s = await scenario({ revokedIndexes: [5] });
    const r = await verifyCredentialOffline(s.jws, { ...s.base, checkStatus: false });
    expect(r).toMatchObject({ valid: true, revoked: null });
    expect(checkOf(r, 'status')?.ok).toBe(true);
  });

  it('a list signed by a different key is rejected', async () => {
    const s = await scenario();
    const attacker = await makeKey('EdDSA', s.key.kid);
    const evil = await signList(attacker, bitstring(131072));
    expect(await verifyCredentialOffline(s.jws, { ...s.base, statusListFetch: async () => evil })).toMatchObject({ reason: REASONS.STATUS_LIST_SIGNATURE_INVALID });
    const unknownKid = await signList(s.key, bitstring(131072), { kid: 'nope' });
    expect(await verifyCredentialOffline(s.jws, { ...s.base, statusListFetch: async () => unknownKid })).toMatchObject({ reason: REASONS.STATUS_LIST_SIGNATURE_INVALID });
  });

  it('rejects lists that do not match the credential entry (other list, purpose, issuer, subject id)', async () => {
    const s = await scenario();
    const other = await signList(s.key, bitstring(131072), { url: 'https://campussync.test/api/status/revocation/rev-2' });
    const base = (l: unknown) => ({ ...s.base, statusListFetch: async () => l as never });
    expect(await verifyCredentialOffline(s.jws, base(other))).toMatchObject({ reason: REASONS.STATUS_LIST_INVALID });
    expect(await verifyCredentialOffline(s.jws, base(await signList(s.key, bitstring(131072), { purpose: 'suspension' })))).toMatchObject({ reason: REASONS.STATUS_LIST_INVALID });
    expect(await verifyCredentialOffline(s.jws, base(await signList(s.key, bitstring(131072), { subjectId: 'https://x.test#list' })))).toMatchObject({ reason: REASONS.STATUS_LIST_INVALID });
    expect(await verifyCredentialOffline(s.jws, base(await signList(s.key, bitstring(131072), { iss: 'did:web:someone-else.test' })))).toMatchObject({ reason: REASONS.STATUS_LIST_INVALID });
    expect(await verifyCredentialOffline(s.jws, base({ nothing: true }))).toMatchObject({ reason: REASONS.STATUS_LIST_INVALID });
    expect(await verifyCredentialOffline(s.jws, base('not.a.jws!'))).toMatchObject({ valid: false });
  });

  it('index outside the list, corrupt gzip, bad prefix and gzip bombs fail closed', async () => {
    const s = await scenario({ index: 200000 });
    expect(await verifyCredentialOffline(s.jws, s.base)).toMatchObject({ reason: REASONS.STATUS_INDEX_OUT_OF_RANGE });
    const ok = await scenario();
    const corrupt = await signList(ok.key, bitstring(16), { encodedList: 'u' + Buffer.from('definitely not gzip').toString('base64url') });
    expect(await verifyCredentialOffline(ok.jws, { ...ok.base, statusListFetch: async () => corrupt })).toMatchObject({ reason: REASONS.STATUS_LIST_INVALID });
    const noPrefix = await signList(ok.key, bitstring(131072), { encodedList: encodeBits(bitstring(131072)).slice(1) });
    expect(await verifyCredentialOffline(ok.jws, { ...ok.base, statusListFetch: async () => noPrefix })).toMatchObject({ reason: REASONS.STATUS_LIST_INVALID });
    const bomb = await signList(ok.key, bitstring(16), { encodedList: 'u' + gzipSync(Buffer.alloc(9 * 1024 * 1024)).toString('base64url') });
    expect(await verifyCredentialOffline(ok.jws, { ...ok.base, statusListFetch: async () => bomb })).toMatchObject({ reason: REASONS.STATUS_LIST_INVALID });
  });

  it('malformed status entries are rejected (non-numeric index, non-https list URL, wrong type)', async () => {
    const key = await makeKey();
    const list = await signList(key, bitstring(131072));
    const base = { jwks: jwksOf(key), now: NOW, statusListFetch: async () => list };
    for (const bad of [
      { ...credentialStatus(1), statusListIndex: '-1' },
      { ...credentialStatus(1), statusListIndex: '1e3' },
      { ...credentialStatus(1), statusListCredential: 'http://campussync.test/api/status/revocation/rev-1' },
      { ...credentialStatus(1), type: 'Other' },
    ]) {
      const { jws } = await signCred(key, { status: bad as never });
      expect(await verifyCredentialOffline(jws, base)).toMatchObject({ valid: false, reason: REASONS.STATUS_ENTRY_INVALID });
    }
  });

  it('maxStatusListAgeSec rejects stale lists', async () => {
    const key = await makeKey();
    const { jws } = await signCred(key, { status: credentialStatus(1) });
    const nowSec = Math.floor(NOW.getTime() / 1000);
    const stale = await signList(key, bitstring(131072), { iat: nowSec - 7 * 86400 });
    const base = { jwks: jwksOf(key), now: NOW, statusListFetch: async () => stale };
    expect((await verifyCredentialOffline(jws, base)).valid).toBe(true);
    expect(await verifyCredentialOffline(jws, { ...base, maxStatusListAgeSec: 3600 })).toMatchObject({ reason: REASONS.STATUS_LIST_STALE });
  });

  it('decodeEncodedList / getStatusBit follow the MSB-first bit order', async () => {
    const bytes = bitstring(64, [0, 7, 8, 63]);
    const decoded = await decodeEncodedList(encodeBits(bytes));
    expect(Array.from(decoded)).toEqual(Array.from(bytes));
    expect([0, 7, 8, 63].every(i => getStatusBit(decoded, i))).toBe(true);
    expect([1, 6, 9, 62].some(i => getStatusBit(decoded, i))).toBe(false);
    expect(decoded[0]).toBe(0b1000_0001);
  });
});
