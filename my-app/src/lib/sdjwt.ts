/**
 * Selective-disclosure JWT (SD-JWT) helpers.
 *
 * MODELLED ON the IETF draft "Selective Disclosure for JWTs (SD-JWT)"
 * (draft-ietf-oauth-selective-disclosure-jwt) as understood by the authors of
 * this file. It is NOT a certified or interoperability-tested implementation.
 * It supports only top-level object-property disclosures (no nested
 * disclosures, no array-element disclosures).
 *
 * Wire format:
 *   <issuer-signed JWT>~<disclosure 1>~<disclosure 2>~...~[<key-binding JWT>]
 * A Disclosure is base64url(JSON [salt, claimName, claimValue]). The signed
 * payload holds `_sd`: sorted base64url(SHA-256(disclosure)) digests (plus
 * random decoys) and `_sd_alg: "sha-256"`.
 *
 * This module is pure (jose + WebCrypto only) and has no server-only imports,
 * so it runs unchanged in the browser and on the server.
 */
import { SignJWT, compactVerify, decodeProtectedHeader, importJWK, base64url, generateKeyPair, exportJWK } from 'jose';
import type { JWK, CryptoKey as JoseCryptoKey } from 'jose';

export type { JWK };

/** Signature algorithms accepted for issuer and key-binding JWTs. */
export const SD_ALLOWED_ALGS = ['EdDSA', 'ES256', 'RS256'] as const;
export type SdAlg = (typeof SD_ALLOWED_ALGS)[number];

export const SD_TYP_VC = 'vc+sd-jwt';
export const SD_TYP_DC = 'dc+sd-jwt';
export const SD_TYP_KB = 'kb+jwt';
const ALLOWED_ISSUER_TYPS = [SD_TYP_VC, SD_TYP_DC];

/** Claim names that may never be created through a Disclosure. */
const RESERVED_DISCLOSURE_NAMES = new Set(['_sd', '...', '_sd_alg', '__proto__']);
/** Claim names the issuer sets itself; callers may not supply them in `claims`. */
const ISSUER_SET_CLAIMS = new Set(['iss', 'sub', 'iat', 'exp', 'nbf', 'jti', 'vct', 'cnf', '_sd', '_sd_alg', '...']);

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder('utf-8', { fatal: true });
const B64URL_RE = /^[A-Za-z0-9_-]+$/;

/** Stable machine-readable reasons returned by verifyPresentation. */
export type SdFailureReason =
  | 'malformed_presentation'
  | 'malformed_jws'
  | 'unsupported_alg'
  | 'unsupported_typ'
  | 'no_matching_key'
  | 'bad_signature'
  | 'missing_claim'
  | 'expired'
  | 'not_yet_valid'
  | 'issuer_mismatch'
  | 'unsupported_sd_alg'
  | 'invalid_sd_claim'
  | 'malformed_disclosure'
  | 'duplicate_disclosure'
  | 'duplicate_claim_name'
  | 'unknown_disclosure_digest'
  | 'reserved_claim_name'
  | 'disclosure_claim_collision'
  | 'key_binding_required'
  | 'kb_missing_cnf'
  | 'kb_malformed'
  | 'kb_unsupported_alg'
  | 'kb_unsupported_typ'
  | 'kb_bad_signature'
  | 'kb_sd_hash_mismatch'
  | 'kb_audience_mismatch'
  | 'kb_nonce_mismatch'
  | 'kb_too_old'
  | 'kb_in_future';

export type SdReason = 'ok' | SdFailureReason;

export class SdJwtError extends Error {
  readonly code: string;
  constructor(code: string, message?: string) {
    super(message ?? code);
    this.name = 'SdJwtError';
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// primitives
// ---------------------------------------------------------------------------

function b64uEncodeString(s: string): string {
  return base64url.encode(textEncoder.encode(s));
}

async function sha256b64u(input: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', textEncoder.encode(input));
  return base64url.encode(new Uint8Array(digest));
}

function randomB64u(bytes: number): string {
  const buf = new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(buf);
  return base64url.encode(buf);
}

function nowSeconds(now?: Date | number): number {
  if (now instanceof Date) return Math.floor(now.getTime() / 1000);
  if (typeof now === 'number') return Math.floor(now);
  return Math.floor(Date.now() / 1000);
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Infer the JOSE alg for a JWK when it carries no `alg`. */
export function algForJwk(jwk: JWK): SdAlg {
  if (jwk.alg) {
    if ((SD_ALLOWED_ALGS as readonly string[]).includes(jwk.alg)) return jwk.alg as SdAlg;
    throw new SdJwtError('unsupported_alg', `Unsupported key algorithm: ${jwk.alg}`);
  }
  if (jwk.kty === 'OKP' && jwk.crv === 'Ed25519') return 'EdDSA';
  if (jwk.kty === 'EC' && jwk.crv === 'P-256') return 'ES256';
  if (jwk.kty === 'RSA') return 'RS256';
  throw new SdJwtError('unsupported_alg', 'Cannot infer algorithm for this key type');
}

const PRIVATE_JWK_MEMBERS = ['d', 'p', 'q', 'dp', 'dq', 'qi', 'oth', 'k'];

/** Remove private members from a JWK (never mutates the input). */
export function toPublicJwkSafe(jwk: JWK): JWK {
  const out: Record<string, unknown> = { ...jwk };
  for (const m of PRIVATE_JWK_MEMBERS) delete out[m];
  delete out.key_ops;
  delete out.use;
  return out as JWK;
}

type SigningKey = JWK | JoseCryptoKey | CryptoKey;

async function resolveSigningKey(key: SigningKey, alg?: SdAlg): Promise<{ key: CryptoKey | Uint8Array; alg: SdAlg; kid?: string }> {
  const isJwk = isPlainObject(key) && typeof (key as JWK).kty === 'string';
  if (isJwk) {
    const jwk = key as JWK;
    if (jwk.kty === 'oct') throw new SdJwtError('unsupported_alg', 'Symmetric keys are not accepted');
    if (!jwk.d) throw new SdJwtError('invalid_key', 'A private key is required for signing');
    const useAlg = alg ?? algForJwk(jwk);
    const imported = await importJWK(jwk, useAlg);
    return { key: imported as CryptoKey | Uint8Array, alg: useAlg, kid: jwk.kid };
  }
  return { key: key as CryptoKey, alg: alg ?? 'ES256' };
}

/** Generate an ephemeral holder key pair (ES256) for key binding. */
export async function generateHolderKey(): Promise<{ privateKey: CryptoKey; publicJwk: JWK }> {
  const { privateKey, publicKey } = await generateKeyPair('ES256', { extractable: true });
  const publicJwk = await exportJWK(publicKey);
  return { privateKey: privateKey as CryptoKey, publicJwk: { ...publicJwk, alg: 'ES256' } };
}

// ---------------------------------------------------------------------------
// issuance
// ---------------------------------------------------------------------------

export interface IssueSdJwtParams {
  claims: Record<string, unknown>;
  /** Names (keys of `claims`) that become selectively disclosable. */
  disclosable: string[];
  /** Issuer PRIVATE JWK. `alg` and `kid` are taken from it. */
  issuerKey: JWK;
  issuer: string;
  subject: string;
  vct: string;
  expiresInSeconds: number;
  holderPublicJwk?: JWK;
  /** Number of decoy digests added to `_sd` (default 2). */
  decoyCount?: number;
  /** JOSE `typ` header: 'vc+sd-jwt' (default) or 'dc+sd-jwt'. */
  typ?: typeof SD_TYP_VC | typeof SD_TYP_DC;
  now?: Date | number;
  jti?: string;
}

export interface IssuedSdJwt {
  /** `<jws>~<disclosure>~...~` (trailing tilde, no key binding). */
  sdJwt: string;
  jti: string;
  /** The sorted digest list as signed (includes decoys). */
  digests: string[];
  /** Number of real (non-decoy) disclosures. */
  disclosureCount: number;
}

export async function issueSdJwt(params: IssueSdJwtParams): Promise<IssuedSdJwt> {
  const { claims, disclosable, issuerKey, issuer, subject, vct, expiresInSeconds } = params;
  if (!isPlainObject(claims)) throw new SdJwtError('invalid_claims', 'claims must be an object');
  if (!(expiresInSeconds > 0)) throw new SdJwtError('invalid_expiry', 'expiresInSeconds must be positive');
  const decoyCount = params.decoyCount ?? 2;
  if (!Number.isInteger(decoyCount) || decoyCount < 0 || decoyCount > 50) {
    throw new SdJwtError('invalid_decoy_count', 'decoyCount must be an integer between 0 and 50');
  }

  for (const name of Object.keys(claims)) {
    if (ISSUER_SET_CLAIMS.has(name)) throw new SdJwtError('reserved_claim_name', `Claim "${name}" is set by the issuer and cannot be supplied`);
  }
  const uniqueDisclosable = Array.from(new Set(disclosable));
  if (uniqueDisclosable.length !== disclosable.length) throw new SdJwtError('duplicate_claim_name', 'disclosable contains duplicates');
  for (const name of uniqueDisclosable) {
    if (RESERVED_DISCLOSURE_NAMES.has(name)) throw new SdJwtError('reserved_claim_name', `"${name}" cannot be disclosable`);
    if (!Object.prototype.hasOwnProperty.call(claims, name)) throw new SdJwtError('unknown_claim', `Disclosable claim "${name}" is not in claims`);
  }

  const alg = algForJwk(issuerKey);
  const { key, kid } = await resolveSigningKey(issuerKey, alg);

  const disclosures: string[] = [];
  const digests: string[] = [];
  const payload: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(claims)) {
    if (uniqueDisclosable.includes(name)) {
      const disclosure = b64uEncodeString(JSON.stringify([randomB64u(16), name, value]));
      disclosures.push(disclosure);
      digests.push(await sha256b64u(disclosure));
    } else {
      payload[name] = value;
    }
  }
  for (let i = 0; i < decoyCount; i++) {
    // A decoy digest is the hash of random bytes nobody can map back to a claim.
    digests.push(await sha256b64u(randomB64u(16)));
  }
  digests.sort();

  const iat = nowSeconds(params.now);
  const jti = params.jti ?? globalThis.crypto.randomUUID();
  payload.iss = issuer;
  payload.sub = subject;
  payload.vct = vct;
  payload.iat = iat;
  payload.exp = iat + Math.floor(expiresInSeconds);
  payload.jti = jti;
  if (digests.length > 0) {
    payload._sd = digests;
    payload._sd_alg = 'sha-256';
  }
  if (params.holderPublicJwk) {
    payload.cnf = { jwk: toPublicJwkSafe(params.holderPublicJwk) };
  }

  const header: { alg: string; typ: string; kid?: string } = { alg, typ: params.typ ?? SD_TYP_VC };
  if (kid) header.kid = kid;
  const jws = await new SignJWT(payload).setProtectedHeader(header).sign(key);

  return { sdJwt: `${jws}~${disclosures.map((d) => d + '~').join('')}`, jti, digests, disclosureCount: disclosures.length };
}

// ---------------------------------------------------------------------------
// parsing / presentation
// ---------------------------------------------------------------------------

export interface ParsedDisclosure {
  encoded: string;
  salt: string;
  name: string;
  value: unknown;
}

function decodeDisclosure(encoded: string): ParsedDisclosure {
  if (!encoded || !B64URL_RE.test(encoded)) throw new SdJwtError('malformed_disclosure');
  let arr: unknown;
  try {
    arr = JSON.parse(textDecoder.decode(base64url.decode(encoded)));
  } catch {
    throw new SdJwtError('malformed_disclosure');
  }
  if (!Array.isArray(arr) || arr.length !== 3) throw new SdJwtError('malformed_disclosure');
  const [salt, name, value] = arr as [unknown, unknown, unknown];
  if (typeof salt !== 'string' || salt.length === 0 || typeof name !== 'string' || name.length === 0) {
    throw new SdJwtError('malformed_disclosure');
  }
  return { encoded, salt, name, value };
}

/** Split `<jws>~<d1>~...~<kb?>` and decode disclosures. */
export function parseSdJwt(serialized: string): { jws: string; disclosures: ParsedDisclosure[]; kbJwt: string | null } {
  if (typeof serialized !== 'string' || serialized.length === 0) throw new SdJwtError('malformed_presentation');
  const parts = serialized.split('~');
  if (parts.length < 2) throw new SdJwtError('malformed_presentation');
  const jws = parts[0];
  if (jws.split('.').length !== 3) throw new SdJwtError('malformed_jws');
  const last = parts[parts.length - 1];
  const kbJwt = last === '' ? null : last;
  const encodedDisclosures = parts.slice(1, parts.length - 1);
  return { jws, disclosures: encodedDisclosures.map(decodeDisclosure), kbJwt };
}

/** Names of the disclosures contained in an SD-JWT or presentation (no verification). */
export function listDisclosureNames(serialized: string): string[] {
  return parseSdJwt(serialized).disclosures.map((d) => d.name);
}

export interface PresentOptions {
  /** Claim names to reveal. Every name must exist in the SD-JWT's disclosures. */
  reveal: string[];
  /** Holder key (private JWK or CryptoKey) to produce a KB-JWT. */
  holderKey?: SigningKey;
  /** Used only when `holderKey` is a CryptoKey (default ES256). */
  holderAlg?: SdAlg;
  audience?: string;
  nonce?: string;
  now?: Date | number;
}

export async function present(sdJwt: string, options: PresentOptions): Promise<string> {
  const { jws, disclosures, kbJwt } = parseSdJwt(sdJwt);
  if (kbJwt) throw new SdJwtError('malformed_presentation', 'Input already contains a key-binding JWT');
  const reveal = Array.from(new Set(options.reveal));
  const available = new Set(disclosures.map((d) => d.name));
  for (const name of reveal) {
    if (!available.has(name)) throw new SdJwtError('unknown_claim', `Claim "${name}" is not disclosable in this SD-JWT`);
  }
  const chosen = disclosures.filter((d) => reveal.includes(d.name));
  const base = `${jws}~${chosen.map((d) => d.encoded + '~').join('')}`;
  if (!options.holderKey) return base;

  const { key, alg } = await resolveSigningKey(options.holderKey, options.holderAlg);
  const payload: Record<string, unknown> = {
    iat: nowSeconds(options.now),
    sd_hash: await sha256b64u(base),
  };
  if (options.audience !== undefined) payload.aud = options.audience;
  if (options.nonce !== undefined) payload.nonce = options.nonce;
  const kb = await new SignJWT(payload).setProtectedHeader({ alg, typ: SD_TYP_KB }).sign(key);
  return base + kb;
}

// ---------------------------------------------------------------------------
// verification
// ---------------------------------------------------------------------------

export interface VerifyOptions {
  issuerJwks?: JWK[] | { keys: JWK[] };
  issuerPublicJwk?: JWK;
  now?: Date | number;
  /** Seconds of clock skew tolerated for exp/nbf/iat (default 60). */
  clockToleranceSeconds?: number;
  expectedIssuer?: string;
  requireKeyBinding?: boolean;
  expectedAudience?: string;
  expectedNonce?: string;
  /** Maximum age of the KB-JWT `iat` in seconds. */
  maxAgeSeconds?: number;
}

export interface VerifyResult {
  valid: boolean;
  reason: SdReason;
  claims: Record<string, unknown>;
  issuer: string | null;
  expiresAt: number | null;
  keyBound: boolean;
  /** Present when a KB-JWT was verified. */
  keyBinding?: { audience?: string; nonce?: string; iat: number };
  /** Names of the disclosures that were revealed (verified). */
  disclosed: string[];
}

function fail(reason: SdFailureReason, partial: Partial<VerifyResult> = {}): VerifyResult {
  return { valid: false, reason, claims: {}, issuer: null, expiresAt: null, keyBound: false, disclosed: [], ...partial };
}

function collectKeys(opts: VerifyOptions): JWK[] {
  let keys: JWK[] = [];
  if (opts.issuerJwks) keys = Array.isArray(opts.issuerJwks) ? opts.issuerJwks : opts.issuerJwks.keys ?? [];
  if (opts.issuerPublicJwk) keys = [...keys, opts.issuerPublicJwk];
  return keys.filter((k) => isPlainObject(k) && typeof k.kty === 'string' && k.kty !== 'oct').map(toPublicJwkSafe);
}

function selectKey(keys: JWK[], headerAlg: SdAlg, kid: string | undefined): JWK | null {
  const candidates = kid !== undefined ? keys.filter((k) => k.kid === kid) : keys;
  const compatible = candidates.filter((k) => {
    try {
      return algForJwk(k) === headerAlg;
    } catch {
      return false;
    }
  });
  if (kid === undefined && compatible.length !== 1) return null;
  return compatible[0] ?? null;
}

type CompactResult = { ok: true; payload: Record<string, unknown> } | { ok: false; reason: 'malformed' | 'bad_signature' };

async function verifyCompact(jws: string, jwk: JWK, alg: SdAlg): Promise<CompactResult> {
  let key: CryptoKey | Uint8Array;
  try {
    key = (await importJWK(jwk, alg)) as CryptoKey | Uint8Array;
  } catch {
    return { ok: false, reason: 'bad_signature' };
  }
  try {
    const { payload } = await compactVerify(jws, key, { algorithms: [alg] });
    const parsed = JSON.parse(textDecoder.decode(payload));
    if (!isPlainObject(parsed)) return { ok: false, reason: 'malformed' };
    return { ok: true, payload: parsed };
  } catch (e) {
    const code = (e as { code?: string })?.code;
    if (code === 'ERR_JWS_SIGNATURE_VERIFICATION_FAILED') return { ok: false, reason: 'bad_signature' };
    return { ok: false, reason: 'malformed' };
  }
}

function headerAlgOf(token: string): { alg: SdAlg | null; typ?: string; kid?: string; malformed: boolean } {
  try {
    const h = decodeProtectedHeader(token);
    const alg = typeof h.alg === 'string' && (SD_ALLOWED_ALGS as readonly string[]).includes(h.alg) ? (h.alg as SdAlg) : null;
    return { alg, typ: typeof h.typ === 'string' ? h.typ : undefined, kid: typeof h.kid === 'string' ? h.kid : undefined, malformed: false };
  } catch {
    return { alg: null, malformed: true };
  }
}

export async function verifyPresentation(presentation: string, opts: VerifyOptions): Promise<VerifyResult> {
  try {
    return await verifyInner(presentation, opts);
  } catch (e) {
    if (e instanceof SdJwtError) {
      const known = e.code as SdFailureReason;
      return fail(known);
    }
    return fail('malformed_presentation');
  }
}

async function verifyInner(presentation: string, opts: VerifyOptions): Promise<VerifyResult> {
  const now = nowSeconds(opts.now);
  const tolerance = opts.clockToleranceSeconds ?? 60;

  const parsed = parseSdJwt(presentation);

  // ---- issuer JWT -------------------------------------------------------
  const h = headerAlgOf(parsed.jws);
  if (h.malformed) return fail('malformed_jws');
  if (!h.alg) return fail('unsupported_alg');
  if (!h.typ || !ALLOWED_ISSUER_TYPS.includes(h.typ)) return fail('unsupported_typ');

  const key = selectKey(collectKeys(opts), h.alg, h.kid);
  if (!key) return fail('no_matching_key');

  const verified = await verifyCompact(parsed.jws, key, h.alg);
  if (!verified.ok) return fail(verified.reason === 'bad_signature' ? 'bad_signature' : 'malformed_jws');
  const payload = verified.payload;

  const exp = payload.exp;
  if (typeof exp !== 'number' || !Number.isFinite(exp)) return fail('missing_claim');
  if (exp + tolerance <= now) return fail('expired');
  if (payload.nbf !== undefined) {
    if (typeof payload.nbf !== 'number') return fail('invalid_sd_claim');
    if (payload.nbf - tolerance > now) return fail('not_yet_valid');
  }
  const issuer = typeof payload.iss === 'string' ? payload.iss : null;
  if (!issuer) return fail('missing_claim');
  if (opts.expectedIssuer !== undefined && issuer !== opts.expectedIssuer) return fail('issuer_mismatch');

  if (payload._sd_alg !== undefined && payload._sd_alg !== 'sha-256') return fail('unsupported_sd_alg');
  let sdSet = new Set<string>();
  if (payload._sd !== undefined) {
    if (!Array.isArray(payload._sd) || !payload._sd.every((d) => typeof d === 'string' && B64URL_RE.test(d))) {
      return fail('invalid_sd_claim');
    }
    sdSet = new Set(payload._sd as string[]);
    if (sdSet.size !== (payload._sd as string[]).length) return fail('invalid_sd_claim');
  }

  // ---- disclosures --------------------------------------------------------
  const seenDigests = new Set<string>();
  const seenNames = new Set<string>();
  const disclosed: Record<string, unknown> = {};
  for (const d of parsed.disclosures) {
    if (RESERVED_DISCLOSURE_NAMES.has(d.name)) return fail('reserved_claim_name');
    const digest = await sha256b64u(d.encoded);
    if (seenDigests.has(digest)) return fail('duplicate_disclosure');
    seenDigests.add(digest);
    if (!sdSet.has(digest)) return fail('unknown_disclosure_digest');
    if (Object.prototype.hasOwnProperty.call(payload, d.name)) return fail('disclosure_claim_collision');
    if (seenNames.has(d.name)) return fail('duplicate_claim_name');
    seenNames.add(d.name);
    disclosed[d.name] = d.value;
  }

  const claims: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(payload)) {
    if (k === '_sd' || k === '_sd_alg') continue;
    claims[k] = v;
  }
  for (const [k, v] of Object.entries(disclosed)) claims[k] = v;

  const base: Partial<VerifyResult> = { issuer, expiresAt: exp, claims, disclosed: Object.keys(disclosed) };

  // ---- key binding --------------------------------------------------------
  const expectsKb = Boolean(opts.requireKeyBinding) || opts.expectedAudience !== undefined || opts.expectedNonce !== undefined;
  if (!parsed.kbJwt) {
    if (expectsKb) return fail('key_binding_required', base);
    return { valid: true, reason: 'ok', claims, issuer, expiresAt: exp, keyBound: false, disclosed: Object.keys(disclosed) };
  }

  const cnf = payload.cnf;
  const holderJwk = isPlainObject(cnf) && isPlainObject(cnf.jwk) ? (cnf.jwk as unknown as JWK) : null;
  if (!holderJwk || typeof holderJwk.kty !== 'string' || holderJwk.kty === 'oct') return fail('kb_missing_cnf', base);

  const kbH = headerAlgOf(parsed.kbJwt);
  if (kbH.malformed) return fail('kb_malformed', base);
  if (!kbH.alg) return fail('kb_unsupported_alg', base);
  if (kbH.typ !== SD_TYP_KB) return fail('kb_unsupported_typ', base);
  let holderAlg: SdAlg;
  try {
    holderAlg = algForJwk(toPublicJwkSafe(holderJwk));
  } catch {
    return fail('kb_unsupported_alg', base);
  }
  if (holderAlg !== kbH.alg) return fail('kb_unsupported_alg', base);

  const kbVerified = await verifyCompact(parsed.kbJwt, toPublicJwkSafe(holderJwk), kbH.alg);
  if (!kbVerified.ok) return fail(kbVerified.reason === 'bad_signature' ? 'kb_bad_signature' : 'kb_malformed', base);
  const kb = kbVerified.payload;

  const signedPart = presentation.slice(0, presentation.length - parsed.kbJwt.length);
  if (typeof kb.sd_hash !== 'string' || kb.sd_hash !== (await sha256b64u(signedPart))) {
    return fail('kb_sd_hash_mismatch', base);
  }
  if (typeof kb.iat !== 'number' || !Number.isFinite(kb.iat)) return fail('kb_malformed', base);
  if (kb.iat - tolerance > now) return fail('kb_in_future', base);
  if (opts.maxAgeSeconds !== undefined && now - kb.iat > opts.maxAgeSeconds + tolerance) return fail('kb_too_old', base);
  if (opts.expectedAudience !== undefined && kb.aud !== opts.expectedAudience) return fail('kb_audience_mismatch', base);
  if (opts.expectedNonce !== undefined && kb.nonce !== opts.expectedNonce) return fail('kb_nonce_mismatch', base);

  return {
    valid: true,
    reason: 'ok',
    claims,
    issuer,
    expiresAt: exp,
    keyBound: true,
    keyBinding: {
      iat: kb.iat,
      audience: typeof kb.aud === 'string' ? kb.aud : undefined,
      nonce: typeof kb.nonce === 'string' ? kb.nonce : undefined,
    },
    disclosed: Object.keys(disclosed),
  };
}
