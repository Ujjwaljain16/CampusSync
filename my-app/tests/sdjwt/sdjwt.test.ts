// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest';
import { SignJWT, generateKeyPair, exportJWK, base64url, importJWK } from 'jose';
import type { JWK } from 'jose';
import {
  issueSdJwt,
  present,
  verifyPresentation,
  parseSdJwt,
  listDisclosureNames,
  generateHolderKey,
  toPublicJwkSafe,
} from '@/lib/sdjwt';

const enc = new TextEncoder();
const dec = new TextDecoder();
const b64uJson = (v: unknown) => base64url.encode(enc.encode(JSON.stringify(v)));
const sha = async (s: string) => base64url.encode(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(s))));

const CLAIMS = {
  title: 'BSc Computer Science (Distinction)',
  institution: 'Northfield University of Technology',
  date_issued: '2024-06-17',
  certificate_id: 'c7d1f2a0-1b2c-4d3e-8f90-123456789abc',
  credential_ref: 'urn:uuid:0f0f0f0f-aaaa-bbbb-cccc-1234567890ab',
};
const DISCLOSABLE = ['title', 'institution', 'date_issued', 'certificate_id'];

async function makeKey(alg: 'EdDSA' | 'ES256' | 'RS256', kid = 'k1') {
  const { privateKey, publicKey } = await generateKeyPair(alg, { extractable: true });
  const priv = { ...(await exportJWK(privateKey)), alg, kid } as JWK;
  const pub = { ...(await exportJWK(publicKey)), alg, kid } as JWK;
  return { priv, pub };
}

let issuer: { priv: JWK; pub: JWK };
let other: { priv: JWK; pub: JWK };

beforeAll(async () => {
  issuer = await makeKey('EdDSA', 'issuer-1');
  other = await makeKey('EdDSA', 'issuer-1'); // same kid, different key material
});

async function issue(extra: Partial<Parameters<typeof issueSdJwt>[0]> = {}) {
  return issueSdJwt({
    claims: CLAIMS,
    disclosable: DISCLOSABLE,
    issuerKey: issuer.priv,
    issuer: 'did:web:example.test',
    subject: 'urn:uuid:11111111-2222-3333-4444-555555555555',
    vct: 'urn:test:vct',
    expiresInSeconds: 3600,
    ...extra,
  });
}

async function signRaw(payload: Record<string, unknown>, header: Record<string, unknown> = {}) {
  const key = await importJWK(issuer.priv, 'EdDSA');
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'EdDSA', kid: 'issuer-1', typ: 'vc+sd-jwt', ...header })
    .sign(key);
}

const inFuture = (s = 600) => Math.floor(Date.now() / 1000) + s;
const verifyOpts = () => ({ issuerPublicJwk: issuer.pub });

describe('issueSdJwt', () => {
  it('produces <jws>~<disclosures>~ with sorted digests, _sd_alg and decoys', async () => {
    const { sdJwt, digests, disclosureCount } = await issue();
    expect(sdJwt.endsWith('~')).toBe(true);
    const parsed = parseSdJwt(sdJwt);
    expect(parsed.disclosures).toHaveLength(4);
    expect(disclosureCount).toBe(4);
    expect(digests).toHaveLength(6); // 4 real + 2 default decoys
    expect([...digests].sort()).toEqual(digests);
    const payload = JSON.parse(dec.decode(base64url.decode(parsed.jws.split('.')[1])));
    expect(payload._sd).toEqual(digests);
    expect(payload._sd_alg).toBe('sha-256');
    expect(payload.credential_ref).toBe(CLAIMS.credential_ref);
    expect(payload.title).toBeUndefined();
    expect(payload.cnf).toBeUndefined();
    const header = JSON.parse(dec.decode(base64url.decode(parsed.jws.split('.')[0])));
    expect(header).toMatchObject({ alg: 'EdDSA', kid: 'issuer-1', typ: 'vc+sd-jwt' });
    for (const d of parsed.disclosures) expect(digests).toContain(await sha(d.encoded));
  });

  it('uses 128-bit random salts that differ between issuances', async () => {
    const a = parseSdJwt((await issue()).sdJwt).disclosures;
    const b = parseSdJwt((await issue()).sdJwt).disclosures;
    expect(base64url.decode(a[0].salt)).toHaveLength(16);
    expect(a[0].salt).not.toBe(b[0].salt);
    expect(a[0].encoded).not.toBe(b[0].encoded);
  });

  it('never embeds private key members', async () => {
    const { sdJwt } = await issue();
    expect(sdJwt).not.toContain(issuer.priv.d as string);
  });

  it('rejects reserved/unknown/duplicate disclosable names and issuer-set claims', async () => {
    await expect(issue({ disclosable: ['nope'] })).rejects.toMatchObject({ code: 'unknown_claim' });
    await expect(issue({ disclosable: ['title', 'title'] })).rejects.toMatchObject({ code: 'duplicate_claim_name' });
    await expect(issue({ claims: { ...CLAIMS, _sd: 1 } })).rejects.toMatchObject({ code: 'reserved_claim_name' });
    await expect(issue({ claims: { ...CLAIMS, iss: 'evil' } })).rejects.toMatchObject({ code: 'reserved_claim_name' });
    await expect(issue({ disclosable: ['__proto__'] })).rejects.toMatchObject({ code: 'reserved_claim_name' });
    await expect(issue({ expiresInSeconds: 0 })).rejects.toMatchObject({ code: 'invalid_expiry' });
    await expect(issue({ decoyCount: -1 })).rejects.toMatchObject({ code: 'invalid_decoy_count' });
  });

  it('refuses a public key as the issuer key', async () => {
    await expect(issue({ issuerKey: issuer.pub })).rejects.toMatchObject({ code: 'invalid_key' });
  });

  it('adds cnf.jwk (public only) when a holder key is supplied', async () => {
    const holder = await generateHolderKey();
    const { sdJwt } = await issue({ holderPublicJwk: { ...holder.publicJwk, d: 'should-be-stripped' } as JWK });
    const payload = JSON.parse(dec.decode(base64url.decode(parseSdJwt(sdJwt).jws.split('.')[1])));
    expect(payload.cnf.jwk.kty).toBe('EC');
    expect(payload.cnf.jwk.d).toBeUndefined();
  });
});

describe('present + verifyPresentation round trips', () => {
  it('discloses 0 claims', async () => {
    const { sdJwt } = await issue();
    const p = await present(sdJwt, { reveal: [] });
    expect(p.endsWith('~')).toBe(true);
    expect(listDisclosureNames(p)).toEqual([]);
    const r = await verifyPresentation(p, verifyOpts());
    expect(r).toMatchObject({ valid: true, reason: 'ok', keyBound: false, issuer: 'did:web:example.test' });
    expect(r.claims.credential_ref).toBe(CLAIMS.credential_ref);
    expect(r.claims.title).toBeUndefined();
    expect(r.disclosed).toEqual([]);
    expect(r.expiresAt).toBeGreaterThan(Date.now() / 1000);
  });

  it('discloses 1 claim', async () => {
    const { sdJwt } = await issue();
    const r = await verifyPresentation(await present(sdJwt, { reveal: ['title'] }), verifyOpts());
    expect(r.valid).toBe(true);
    expect(r.claims.title).toBe(CLAIMS.title);
    expect(r.claims.institution).toBeUndefined();
    expect(r.claims.date_issued).toBeUndefined();
    expect(r.claims._sd).toBeUndefined();
    expect(r.claims._sd_alg).toBeUndefined();
  });

  it('discloses all claims', async () => {
    const { sdJwt } = await issue();
    const r = await verifyPresentation(await present(sdJwt, { reveal: DISCLOSABLE }), verifyOpts());
    expect(r.valid).toBe(true);
    for (const k of DISCLOSABLE) expect(r.claims[k]).toBe((CLAIMS as Record<string, string>)[k]);
    expect([...r.disclosed].sort()).toEqual([...DISCLOSABLE].sort());
  });

  it('works with any number of decoys (0, 1, 7)', async () => {
    for (const decoyCount of [0, 1, 7]) {
      const { sdJwt, digests } = await issue({ decoyCount });
      expect(digests).toHaveLength(4 + decoyCount);
      const r = await verifyPresentation(await present(sdJwt, { reveal: ['institution'] }), verifyOpts());
      expect(r.valid).toBe(true);
      expect(r.claims.institution).toBe(CLAIMS.institution);
    }
  });

  it('supports ES256, RS256 issuer keys and dc+sd-jwt typ', async () => {
    for (const alg of ['ES256', 'RS256'] as const) {
      const k = await makeKey(alg, `k-${alg}`);
      const { sdJwt } = await issue({ issuerKey: k.priv, typ: 'dc+sd-jwt' });
      const r = await verifyPresentation(await present(sdJwt, { reveal: ['title'] }), { issuerJwks: { keys: [issuer.pub, k.pub] } });
      expect(r).toMatchObject({ valid: true, reason: 'ok' });
    }
  });

  it('selects the key by kid out of a JWKS and fails when kid is unknown', async () => {
    const { sdJwt } = await issue();
    const p = await present(sdJwt, { reveal: [] });
    const decoyKey = await makeKey('EdDSA', 'something-else');
    expect((await verifyPresentation(p, { issuerJwks: [decoyKey.pub, issuer.pub] })).valid).toBe(true);
    expect((await verifyPresentation(p, { issuerJwks: [decoyKey.pub] })).reason).toBe('no_matching_key');
    expect((await verifyPresentation(p, { issuerJwks: [] })).reason).toBe('no_matching_key');
  });

  it('verification keys may carry private members; they are ignored (public only used)', async () => {
    const { sdJwt } = await issue();
    const r = await verifyPresentation(await present(sdJwt, { reveal: [] }), { issuerPublicJwk: issuer.priv });
    expect(r.valid).toBe(true);
  });

  it('present() rejects unknown reveal names and already-bound input', async () => {
    const { sdJwt } = await issue();
    await expect(present(sdJwt, { reveal: ['credential_ref'] })).rejects.toMatchObject({ code: 'unknown_claim' });
    await expect(present(sdJwt, { reveal: ['nope'] })).rejects.toMatchObject({ code: 'unknown_claim' });
    const holder = await generateHolderKey();
    const bound = await present(sdJwt, { reveal: [], holderKey: holder.privateKey, audience: 'a', nonce: 'n' });
    await expect(present(bound, { reveal: [] })).rejects.toBeTruthy();
  });
});

describe('tamper cases', () => {
  it('a disclosure with a changed value fails (same salt, new value)', async () => {
    const { sdJwt } = await issue();
    const d = parseSdJwt(sdJwt).disclosures.find((x) => x.name === 'title')!;
    const forged = b64uJson([d.salt, 'title', 'PhD Astrophysics']);
    const r = await verifyPresentation(`${parseSdJwt(sdJwt).jws}~${forged}~`, verifyOpts());
    expect(r).toMatchObject({ valid: false, reason: 'unknown_disclosure_digest', claims: {} });
  });

  it('a disclosure with a renamed claim fails', async () => {
    const { sdJwt } = await issue();
    const d = parseSdJwt(sdJwt).disclosures.find((x) => x.name === 'title')!;
    const forged = b64uJson([d.salt, 'institution', d.value]);
    const r = await verifyPresentation(`${parseSdJwt(sdJwt).jws}~${forged}~`, verifyOpts());
    expect(r.reason).toBe('unknown_disclosure_digest');
  });

  it('a disclosure swapped in from another SD-JWT (same claims, other salts) fails', async () => {
    const a = await issue();
    const b = await issue();
    const foreign = parseSdJwt(b.sdJwt).disclosures.find((x) => x.name === 'title')!.encoded;
    const r = await verifyPresentation(`${parseSdJwt(a.sdJwt).jws}~${foreign}~`, verifyOpts());
    expect(r.reason).toBe('unknown_disclosure_digest');
  });

  it('a duplicated disclosure fails', async () => {
    const { sdJwt } = await issue();
    const t = parseSdJwt(sdJwt).disclosures.find((x) => x.name === 'title')!.encoded;
    const r = await verifyPresentation(`${parseSdJwt(sdJwt).jws}~${t}~${t}~`, verifyOpts());
    expect(r.reason).toBe('duplicate_disclosure');
  });

  it('an unknown digest (disclosure not issued by the issuer) fails', async () => {
    const { sdJwt } = await issue();
    const fake = b64uJson(['c2FsdHNhbHRzYWx0c2FsdA', 'role', 'admin']);
    const r = await verifyPresentation(`${parseSdJwt(sdJwt).jws}~${fake}~`, verifyOpts());
    expect(r.reason).toBe('unknown_disclosure_digest');
  });

  it('an attacker-added claim cannot be smuggled next to valid disclosures', async () => {
    const { sdJwt } = await issue();
    const p = await present(sdJwt, { reveal: ['title'] });
    const fake = b64uJson(['c2FsdHNhbHRzYWx0c2FsdA', 'is_admin', true]);
    expect((await verifyPresentation(p + fake + '~', verifyOpts())).reason).toBe('unknown_disclosure_digest');
  });

  it('tampering with the signed payload invalidates the signature', async () => {
    const { sdJwt } = await issue();
    const parts = sdJwt.split('~');
    const [h, p, s] = parts[0].split('.');
    const payload = JSON.parse(dec.decode(base64url.decode(p)));
    payload.exp += 100000;
    parts[0] = [h, b64uJson(payload), s].join('.');
    expect((await verifyPresentation(parts.join('~'), verifyOpts())).reason).toBe('bad_signature');
  });

  it('a disclosure that redefines a non-selective claim is rejected even if its digest is signed', async () => {
    const dis = b64uJson(['c2FsdA', 'credential_ref', 'urn:uuid:evil']);
    const jws = await signRaw({ iss: 'x', iat: 1, exp: inFuture(), credential_ref: 'urn:uuid:real', _sd: [await sha(dis)], _sd_alg: 'sha-256' });
    expect((await verifyPresentation(`${jws}~${dis}~`, verifyOpts())).reason).toBe('disclosure_claim_collision');
  });

  it.each(['_sd', '...', '_sd_alg', '__proto__'])('reserved disclosure name %s is rejected', async (name) => {
    const dis = b64uJson(['c2FsdA', name, 'x']);
    const jws = await signRaw({ iss: 'x', iat: 1, exp: inFuture(), _sd: [await sha(dis)] });
    expect((await verifyPresentation(`${jws}~${dis}~`, verifyOpts())).reason).toBe('reserved_claim_name');
  });

  it('two valid disclosures for the same claim name are rejected', async () => {
    const d1 = b64uJson(['c2FsdDE', 'title', 'A']);
    const d2 = b64uJson(['c2FsdDI', 'title', 'B']);
    const jws = await signRaw({ iss: 'x', iat: 1, exp: inFuture(), _sd: [await sha(d1), await sha(d2)] });
    expect((await verifyPresentation(`${jws}~${d1}~${d2}~`, verifyOpts())).reason).toBe('duplicate_claim_name');
  });

  it('malformed inputs yield stable reasons and never throw', async () => {
    const { sdJwt } = await issue();
    const jws = parseSdJwt(sdJwt).jws;
    const cases: Array<[string, string]> = [
      ['', 'malformed_presentation'],
      ['not-a-jwt', 'malformed_presentation'],
      ['a.b.c', 'malformed_presentation'],
      ['a.b.c~', 'malformed_jws'],
      [`${jws}~!!!notbase64!!!~`, 'malformed_disclosure'],
      [`${jws}~${base64url.encode(enc.encode('not json'))}~`, 'malformed_disclosure'],
      [`${jws}~${b64uJson(['salt', 'name'])}~`, 'malformed_disclosure'], // array-element form unsupported
      [`${jws}~${b64uJson({ salt: 1 })}~`, 'malformed_disclosure'],
      [`${jws}~${b64uJson([1, 'name', 'v'])}~`, 'malformed_disclosure'],
      [`${jws}~~~`, 'malformed_disclosure'],
    ];
    for (const [input, reason] of cases) {
      const r = await verifyPresentation(input, verifyOpts());
      expect(r.valid, input).toBe(false);
      expect(r.reason, input).toBe(reason);
      expect(r.claims).toEqual({});
    }
    expect((await verifyPresentation(undefined as unknown as string, verifyOpts())).valid).toBe(false);
  });
});

describe('issuer signature, algorithms, time', () => {
  it('rejects a different issuer key even with the same kid', async () => {
    const { sdJwt } = await issue();
    const r = await verifyPresentation(await present(sdJwt, { reveal: [] }), { issuerPublicJwk: other.pub });
    expect(r.reason).toBe('bad_signature');
  });

  it('rejects an expired SD-JWT and one not yet valid', async () => {
    const t0 = 1_800_000_000;
    const { sdJwt } = await issue({ now: t0, expiresInSeconds: 600 });
    const p = await present(sdJwt, { reveal: [] });
    expect((await verifyPresentation(p, { ...verifyOpts(), now: t0 + 300 })).valid).toBe(true);
    expect((await verifyPresentation(p, { ...verifyOpts(), now: t0 + 600 + 3600 })).reason).toBe('expired');

    const jws = await signRaw({ iss: 'x', iat: t0, nbf: t0 + 10_000, exp: t0 + 20_000 });
    expect((await verifyPresentation(`${jws}~`, { ...verifyOpts(), now: t0 })).reason).toBe('not_yet_valid');
  });

  it('rejects tokens without exp or iss', async () => {
    const a = await signRaw({ iss: 'x' });
    expect((await verifyPresentation(`${a}~`, verifyOpts())).reason).toBe('missing_claim');
    const b = await signRaw({ exp: inFuture() });
    expect((await verifyPresentation(`${b}~`, verifyOpts())).reason).toBe('missing_claim');
  });

  it('enforces expectedIssuer', async () => {
    const { sdJwt } = await issue();
    const p = await present(sdJwt, { reveal: [] });
    expect((await verifyPresentation(p, { ...verifyOpts(), expectedIssuer: 'did:web:example.test' })).valid).toBe(true);
    expect((await verifyPresentation(p, { ...verifyOpts(), expectedIssuer: 'did:web:other.test' })).reason).toBe('issuer_mismatch');
  });

  it('rejects alg "none"', async () => {
    const h = b64uJson({ alg: 'none', typ: 'vc+sd-jwt', kid: 'issuer-1' });
    const p = b64uJson({ iss: 'x', iat: 1, exp: inFuture() });
    expect((await verifyPresentation(`${h}.${p}.~`, verifyOpts())).reason).toBe('unsupported_alg');
    expect((await verifyPresentation(`${h}.${p}.AAAA~`, verifyOpts())).reason).toBe('unsupported_alg');
  });

  it('rejects HS256 signed with the public key bytes as the HMAC secret', async () => {
    const secret = base64url.decode(issuer.pub.x as string);
    const jws = await new SignJWT({ iss: 'x', iat: 1, exp: inFuture() })
      .setProtectedHeader({ alg: 'HS256', kid: 'issuer-1', typ: 'vc+sd-jwt' })
      .sign(secret);
    expect((await verifyPresentation(`${jws}~`, verifyOpts())).reason).toBe('unsupported_alg');
    const octKey: JWK = { kty: 'oct', k: base64url.encode(secret), kid: 'issuer-1', alg: 'HS256' };
    expect((await verifyPresentation(`${jws}~`, { issuerPublicJwk: octKey })).reason).toBe('unsupported_alg');
  });

  it('rejects a token whose alg does not match the key type (RS256 header, Ed25519 key)', async () => {
    const rsa = await makeKey('RS256', 'issuer-1');
    const { sdJwt } = await issue({ issuerKey: rsa.priv });
    const r = await verifyPresentation(sdJwt, { issuerPublicJwk: { ...issuer.pub } });
    expect(r.reason).toBe('no_matching_key');
  });

  it('rejects a wrong or missing typ (plain JWT used as issuer token)', async () => {
    const jwt = await signRaw({ iss: 'x', iat: 1, exp: inFuture() }, { typ: 'JWT' });
    expect((await verifyPresentation(`${jwt}~`, verifyOpts())).reason).toBe('unsupported_typ');
    const noTyp = await signRaw({ iss: 'x', iat: 1, exp: inFuture() }, { typ: undefined });
    expect((await verifyPresentation(`${noTyp}~`, verifyOpts())).reason).toBe('unsupported_typ');
  });

  it('rejects unsupported _sd_alg and a malformed _sd', async () => {
    const base = { iss: 'x', iat: 1, exp: inFuture() };
    expect((await verifyPresentation(`${await signRaw({ ...base, _sd_alg: 'sha-512' })}~`, verifyOpts())).reason).toBe('unsupported_sd_alg');
    expect((await verifyPresentation(`${await signRaw({ ...base, _sd: 'abc' })}~`, verifyOpts())).reason).toBe('invalid_sd_claim');
    expect((await verifyPresentation(`${await signRaw({ ...base, _sd: ['abc', 'abc'] })}~`, verifyOpts())).reason).toBe('invalid_sd_claim');
    expect((await verifyPresentation(`${await signRaw({ ...base, _sd: [1] })}~`, verifyOpts())).reason).toBe('invalid_sd_claim');
  });
});

describe('key binding (KB-JWT)', () => {
  async function bound(overrides: { audience?: string; nonce?: string; now?: number } = {}) {
    const holder = await generateHolderKey();
    const { sdJwt } = await issue({ holderPublicJwk: holder.publicJwk });
    const p = await present(sdJwt, {
      reveal: ['title'],
      holderKey: holder.privateKey,
      audience: 'recruiter.example',
      nonce: 'nonce-123',
      ...overrides,
    });
    return { holder, sdJwt, p };
  }

  it('happy path with audience and nonce', async () => {
    const { p } = await bound();
    const r = await verifyPresentation(p, {
      ...verifyOpts(),
      requireKeyBinding: true,
      expectedAudience: 'recruiter.example',
      expectedNonce: 'nonce-123',
      maxAgeSeconds: 300,
    });
    expect(r).toMatchObject({ valid: true, reason: 'ok', keyBound: true });
    expect(r.keyBinding).toMatchObject({ audience: 'recruiter.example', nonce: 'nonce-123' });
    expect(r.claims.title).toBe(CLAIMS.title);
    const kb = p.slice(p.lastIndexOf('~') + 1);
    const kbPayload = JSON.parse(dec.decode(base64url.decode(kb.split('.')[1])));
    expect(kbPayload.sd_hash).toBe(await sha(p.slice(0, p.lastIndexOf('~') + 1)));
  });

  it('works with an exported private JWK as holder key', async () => {
    const pair = await generateKeyPair('ES256', { extractable: true });
    const privJwk = { ...(await exportJWK(pair.privateKey)), alg: 'ES256' } as JWK;
    const pubJwk = { ...(await exportJWK(pair.publicKey)), alg: 'ES256' } as JWK;
    const { sdJwt } = await issue({ holderPublicJwk: pubJwk });
    const p = await present(sdJwt, { reveal: [], holderKey: privJwk, audience: 'a', nonce: 'n' });
    const r = await verifyPresentation(p, { ...verifyOpts(), requireKeyBinding: true, expectedAudience: 'a', expectedNonce: 'n' });
    expect(r.keyBound).toBe(true);
  });

  it('fails on wrong audience and wrong nonce', async () => {
    const { p } = await bound();
    expect((await verifyPresentation(p, { ...verifyOpts(), expectedAudience: 'evil.example' })).reason).toBe('kb_audience_mismatch');
    expect((await verifyPresentation(p, { ...verifyOpts(), expectedNonce: 'other' })).reason).toBe('kb_nonce_mismatch');
  });

  it('fails when the disclosure set changes after the KB-JWT was made (sd_hash)', async () => {
    const holder = await generateHolderKey();
    const { sdJwt } = await issue({ holderPublicJwk: holder.publicJwk });
    const p = await present(sdJwt, { reveal: ['title'], holderKey: holder.privateKey, audience: 'a', nonce: 'n' });
    const kb = p.slice(p.lastIndexOf('~') + 1);
    const extra = parseSdJwt(sdJwt).disclosures.find((d) => d.name === 'date_issued')!.encoded;
    const widened = p.slice(0, p.lastIndexOf('~') + 1) + extra + '~' + kb;
    expect((await verifyPresentation(widened, verifyOpts())).reason).toBe('kb_sd_hash_mismatch');
  });

  it('fails with a KB-JWT signed by a different holder key', async () => {
    const holder = await generateHolderKey();
    const attacker = await generateHolderKey();
    const { sdJwt } = await issue({ holderPublicJwk: holder.publicJwk });
    const p = await present(sdJwt, { reveal: [], holderKey: attacker.privateKey, audience: 'a', nonce: 'n' });
    expect((await verifyPresentation(p, verifyOpts())).reason).toBe('kb_bad_signature');
  });

  it('requires key binding when asked, or when audience/nonce are expected', async () => {
    const { sdJwt } = await issue();
    const p = await present(sdJwt, { reveal: [] });
    expect((await verifyPresentation(p, { ...verifyOpts(), requireKeyBinding: true })).reason).toBe('key_binding_required');
    expect((await verifyPresentation(p, { ...verifyOpts(), expectedAudience: 'a' })).reason).toBe('key_binding_required');
    expect((await verifyPresentation(p, { ...verifyOpts(), expectedNonce: 'n' })).reason).toBe('key_binding_required');
  });

  it('fails when a KB-JWT is attached but the SD-JWT has no cnf', async () => {
    const holder = await generateHolderKey();
    const { sdJwt } = await issue();
    const p = await present(sdJwt, { reveal: [], holderKey: holder.privateKey, audience: 'a', nonce: 'n' });
    expect((await verifyPresentation(p, verifyOpts())).reason).toBe('kb_missing_cnf');
  });

  it('enforces KB-JWT age and rejects future-dated KB-JWTs', async () => {
    const t = Math.floor(Date.now() / 1000);
    const { p } = await bound({ now: t - 1000 });
    expect((await verifyPresentation(p, { ...verifyOpts(), maxAgeSeconds: 60 })).reason).toBe('kb_too_old');
    expect((await verifyPresentation(p, { ...verifyOpts(), maxAgeSeconds: 5000 })).valid).toBe(true);
    const future = await bound({ now: t + 10_000 });
    expect((await verifyPresentation(future.p, verifyOpts())).reason).toBe('kb_in_future');
  });

  it('rejects a KB-JWT with the wrong typ, and a garbage KB-JWT', async () => {
    const holder = await generateHolderKey();
    const { sdJwt } = await issue({ holderPublicJwk: holder.publicJwk });
    const base = await present(sdJwt, { reveal: [] });
    const badTyp = await new SignJWT({ iat: Math.floor(Date.now() / 1000), sd_hash: 'x' })
      .setProtectedHeader({ alg: 'ES256', typ: 'JWT' })
      .sign(holder.privateKey);
    expect((await verifyPresentation(base + badTyp, verifyOpts())).reason).toBe('kb_unsupported_typ');
    expect((await verifyPresentation(base + 'garbage', verifyOpts())).reason).toBe('kb_malformed');
  });

  it('rejects a KB-JWT with alg "none"', async () => {
    const holder = await generateHolderKey();
    const { sdJwt } = await issue({ holderPublicJwk: holder.publicJwk });
    const base = await present(sdJwt, { reveal: [] });
    const kb = `${b64uJson({ alg: 'none', typ: 'kb+jwt' })}.${b64uJson({ iat: 1, sd_hash: 'x' })}.`;
    expect((await verifyPresentation(base + kb, verifyOpts())).reason).toBe('kb_unsupported_alg');
  });
});

describe('privacy: unrevealed claims are not present in the presentation', () => {
  function allDecodedViews(s: string): string[] {
    const views = [s];
    for (const seg of s.split(/[~.]/)) {
      if (!seg) continue;
      try {
        views.push(dec.decode(base64url.decode(seg)));
      } catch {
        /* not base64url */
      }
    }
    return views;
  }

  it('hides the plaintext of every withheld claim (raw and base64-decoded) and reveals only the chosen one', async () => {
    const secrets = {
      title: 'ZZ-TITLE-PLAINTEXT-ZZ',
      institution: 'ZZ-INSTITUTION-PLAINTEXT-ZZ',
      date_issued: '1999-12-31',
      certificate_id: 'ZZ-CERTID-PLAINTEXT-ZZ',
    };
    const holder = await generateHolderKey();
    const { sdJwt } = await issue({ claims: { ...secrets, credential_ref: CLAIMS.credential_ref }, holderPublicJwk: holder.publicJwk });
    const p = await present(sdJwt, { reveal: ['title'], holderKey: holder.privateKey, audience: 'a', nonce: 'n' });
    const views = allDecodedViews(p);
    for (const v of [secrets.institution, secrets.date_issued, secrets.certificate_id]) {
      expect(views.some((x) => x.includes(v)), v).toBe(false);
      expect(p.includes(base64url.encode(enc.encode(v)))).toBe(false);
    }
    expect(views.some((x) => x.includes(secrets.title))).toBe(true);
    for (const name of ['institution', 'date_issued', 'certificate_id']) {
      expect(views.some((x) => x.includes(`"${name}"`)), name).toBe(false);
    }
  });

  it('the presentation with zero reveals contains none of the claim values', async () => {
    const { sdJwt } = await issue();
    const p = await present(sdJwt, { reveal: [] });
    const views = allDecodedViews(p);
    for (const v of [CLAIMS.title, CLAIMS.institution, CLAIMS.date_issued, CLAIMS.certificate_id]) {
      expect(views.some((x) => x.includes(v)), v).toBe(false);
    }
  });

  it('toPublicJwkSafe strips private members without mutating input', () => {
    const copy = { ...issuer.priv };
    const pub = toPublicJwkSafe(issuer.priv);
    expect(pub.d).toBeUndefined();
    expect(issuer.priv).toEqual(copy);
  });
});
