/**
 * @campussync/verify: offline verification of CampusSync student credentials.
 *
 * "Offline" means: no CampusSync database or API is consulted. The verifier needs only
 *   - the credential (a compact JWS), and
 *   - the issuer's PUBLIC keys (a JWKS, a did:web document, or a URL it may fetch them from), and
 *   - for revocation, the issuer-signed status list the credential points to.
 *
 * Runs in Node >= 18 and modern browsers: only `jose` plus standard web APIs (fetch,
 * AbortController, DecompressionStream, TextDecoder). No Node-only imports in this file.
 *
 * What this verifies (and nothing more):
 *   JWS signature (algorithm allow-list EdDSA / ES256 / RS256, key chosen by `kid`),
 *   exp / nbf, optional issuer pinning, the shape of the signed `vc` payload, and the
 *   revocation bit of the signed `credentialStatus` entry. It does not validate JSON-LD
 *   contexts, does not run Data Integrity proofs and does not decide whether the issuer
 *   is trustworthy. See verifier/README.md.
 */
import { decodeProtectedHeader, decodeJwt, compactVerify, importJWK, base64url } from 'jose';

export const ALLOWED_ALGS = Object.freeze(['EdDSA', 'ES256', 'RS256']);

/** Stable machine-readable reason codes (`result.reason`). */
export const REASONS = Object.freeze({
	OK: 'ok',
	MISSING_INPUT: 'missing_input',
	MALFORMED_TOKEN: 'malformed_token',
	ALG_NOT_ALLOWED: 'alg_not_allowed',
	NO_KEY_SOURCE: 'no_key_source',
	KEY_FETCH_FAILED: 'key_fetch_failed',
	JWKS_INVALID: 'jwks_invalid',
	UNKNOWN_KEY: 'unknown_key',
	INVALID_SIGNATURE: 'invalid_signature',
	EXPIRED: 'expired',
	NOT_YET_VALID: 'not_yet_valid',
	INVALID_CLAIMS: 'invalid_claims',
	ISSUER_MISMATCH: 'issuer_mismatch',
	INVALID_PAYLOAD: 'invalid_payload',
	STATUS_ENTRY_INVALID: 'status_entry_invalid',
	STATUS_LIST_UNAVAILABLE: 'status_list_unavailable',
	STATUS_LIST_INVALID: 'status_list_invalid',
	STATUS_LIST_SIGNATURE_INVALID: 'status_list_signature_invalid',
	STATUS_LIST_STALE: 'status_list_stale',
	STATUS_INDEX_OUT_OF_RANGE: 'status_index_out_of_range',
	REVOKED: 'revoked',
});

const MAX_JWS_CHARS = 100_000;
const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_MAX_BYTES = 1_000_000; // 1 MB cap on anything fetched
const MAX_REDIRECTS = 3;
const MAX_DECODED_BYTES = 8 * 1024 * 1024;
const DEFAULT_CLOCK_TOLERANCE_SEC = 30;

class VerifierError extends Error {
	/** @param {string} code @param {string} message */
	constructor(code, message) {
		super(message);
		this.name = 'VerifierError';
		this.code = code;
	}
}

// ---------------------------------------------------------------------------
// Input helpers
// ---------------------------------------------------------------------------

/**
 * Accepts a compact JWS, a JSON string, or an object, and returns the compact JWS:
 * `proof.jws` of a credential, a top-level `jws`, or the same inside a `data` envelope
 * (the shape returned by the CampusSync API). Returns null when none is found.
 * @param {unknown} input
 * @returns {string | null}
 */
export function extractJws(input) {
	let v = input;
	if (typeof v === 'string') {
		const t = v.trim();
		if (t.startsWith('{')) {
			try {
				v = JSON.parse(t);
			} catch {
				return null;
			}
		} else {
			return /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/.test(t) ? t : null;
		}
	}
	if (!v || typeof v !== 'object') return null;
	const o = /** @type {Record<string, any>} */ (v);
	const candidate = o.proof?.jws ?? o.jws ?? o.data?.proof?.jws ?? o.data?.jws ?? o.credential?.proof?.jws;
	return typeof candidate === 'string' && candidate ? candidate.trim() : null;
}

/**
 * did:web:host[%3Aport] -> https://host[:port]/.well-known/jwks.json. Only host-only DIDs are
 * supported (path-style did:web would need a different location); returns null otherwise.
 * @param {string | undefined} did
 * @returns {string | null}
 */
export function jwksUrlFromDid(did) {
	const m = /^did:web:([^:]+)$/.exec(did ?? '');
	if (!m) return null;
	let host;
	try {
		host = decodeURIComponent(m[1]);
	} catch {
		return null;
	}
	if (!/^[A-Za-z0-9.-]+(:\d{1,5})?$/.test(host)) return null;
	return `https://${host}/.well-known/jwks.json`;
}

// ---------------------------------------------------------------------------
// Keys
// ---------------------------------------------------------------------------

/** @typedef {{ kid: string | undefined, alg: string | undefined, jwk: Record<string, unknown> }} TrustedKey */

function inferAlg(jwk) {
	if (jwk.kty === 'OKP' && jwk.crv === 'Ed25519') return 'EdDSA';
	if (jwk.kty === 'EC' && jwk.crv === 'P-256') return 'ES256';
	if (jwk.kty === 'RSA') return 'RS256';
	return undefined;
}

/** Copy only PUBLIC members; returns null for unsupported key types (e.g. symmetric keys). */
function toTrustedKey(raw, kidFallback) {
	if (!raw || typeof raw !== 'object') return null;
	const j = /** @type {Record<string, any>} */ (raw);
	const jwk = { kty: j.kty };
	if (j.kty === 'OKP' && j.crv === 'Ed25519' && typeof j.x === 'string') {
		jwk.crv = j.crv;
		jwk.x = j.x;
	} else if (j.kty === 'EC' && j.crv === 'P-256' && typeof j.x === 'string' && typeof j.y === 'string') {
		jwk.crv = j.crv;
		jwk.x = j.x;
		jwk.y = j.y;
	} else if (j.kty === 'RSA' && typeof j.n === 'string' && typeof j.e === 'string') {
		jwk.n = j.n;
		jwk.e = j.e;
	} else {
		return null;
	}
	const kid = typeof j.kid === 'string' && j.kid ? j.kid : kidFallback;
	const alg = typeof j.alg === 'string' && j.alg ? j.alg : inferAlg(jwk);
	return { kid, alg, jwk };
}

/**
 * @param {unknown} jwks `{ keys: [...] }`
 * @returns {TrustedKey[]}
 */
export function keysFromJwks(jwks) {
	const keys = jwks && typeof jwks === 'object' ? /** @type {any} */ (jwks).keys : undefined;
	if (!Array.isArray(keys)) throw new VerifierError(REASONS.JWKS_INVALID, 'JWKS must be an object with a "keys" array');
	const out = keys.map(k => toTrustedKey(k, undefined)).filter(Boolean);
	if (out.length === 0) throw new VerifierError(REASONS.JWKS_INVALID, 'JWKS contains no usable public keys');
	return /** @type {TrustedKey[]} */ (out);
}

/**
 * Keys of a did:web document. When the document has a non-empty `assertionMethod`, only
 * the verification methods it lists are trusted for credentials.
 * @param {unknown} doc
 * @returns {{ keys: TrustedKey[], did: string | undefined }}
 */
export function keysFromDidDocument(doc) {
	if (!doc || typeof doc !== 'object') throw new VerifierError(REASONS.JWKS_INVALID, 'DID document must be an object');
	const d = /** @type {Record<string, any>} */ (doc);
	const methods = Array.isArray(d.verificationMethod) ? d.verificationMethod : [];
	let allowed = null;
	if (Array.isArray(d.assertionMethod) && d.assertionMethod.length > 0) {
		allowed = new Set(d.assertionMethod.map(a => (typeof a === 'string' ? a : a?.id)).filter(Boolean));
	}
	const out = [];
	for (const vm of methods) {
		if (!vm || typeof vm !== 'object' || !vm.publicKeyJwk) continue;
		if (allowed && !allowed.has(vm.id)) continue;
		const fragment = typeof vm.id === 'string' && vm.id.includes('#') ? vm.id.split('#').pop() : undefined;
		const tk = toTrustedKey(vm.publicKeyJwk, fragment);
		if (tk) out.push(tk);
	}
	if (out.length === 0) throw new VerifierError(REASONS.JWKS_INVALID, 'DID document contains no usable assertion keys');
	return { keys: out, did: typeof d.id === 'string' ? d.id : undefined };
}

const importCache = new Map();
async function importTrustedKey(tk, alg) {
	const j = tk.jwk;
	const id = `${alg}|${j.kty}|${j.crv ?? ''}|${j.x ?? ''}|${j.y ?? ''}|${j.n ?? ''}|${j.e ?? ''}`;
	let p = importCache.get(id);
	if (!p) {
		p = importJWK(j, alg);
		importCache.set(id, p);
		if (importCache.size > 64) importCache.delete(importCache.keys().next().value);
		p.catch(() => importCache.delete(id));
	}
	return p;
}

// ---------------------------------------------------------------------------
// Bounded HTTPS fetch
// ---------------------------------------------------------------------------

function assertUrlAllowed(urlStr, allowInsecureHttp) {
	let u;
	try {
		u = new URL(urlStr);
	} catch {
		throw new VerifierError(REASONS.KEY_FETCH_FAILED, 'Invalid URL');
	}
	if (u.username || u.password) throw new VerifierError(REASONS.KEY_FETCH_FAILED, 'URLs with credentials are not allowed');
	if (u.protocol !== 'https:' && !(allowInsecureHttp && u.protocol === 'http:')) {
		throw new VerifierError(REASONS.KEY_FETCH_FAILED, 'Only https:// URLs are allowed');
	}
	return u;
}

async function readLimited(res, maxBytes) {
	const declared = Number(res.headers.get('content-length'));
	if (Number.isFinite(declared) && declared > maxBytes) throw new Error('response too large');
	if (!res.body || typeof res.body.getReader !== 'function') {
		const buf = new Uint8Array(await res.arrayBuffer());
		if (buf.length > maxBytes) throw new Error('response too large');
		return buf;
	}
	const reader = res.body.getReader();
	const chunks = [];
	let total = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		total += value.length;
		if (total > maxBytes) {
			await reader.cancel().catch(() => {});
			throw new Error('response too large');
		}
		chunks.push(value);
	}
	const out = new Uint8Array(total);
	let off = 0;
	for (const c of chunks) {
		out.set(c, off);
		off += c.length;
	}
	return out;
}

/**
 * GET a URL as text with: https only, 5 s timeout, 1 MB cap, and redirects followed manually
 * (at most 3, each target must also be https). Environments that hide redirect targets
 * (browsers return an "opaque redirect") are refused rather than followed blindly.
 * @param {string} url
 * @param {{ fetch?: typeof fetch, timeoutMs?: number, maxBytes?: number, allowInsecureHttp?: boolean, errorCode?: string }} [o]
 * @returns {Promise<string>}
 */
export async function fetchTextLimited(url, o = {}) {
	const doFetch = o.fetch ?? globalThis.fetch;
	const code = o.errorCode ?? REASONS.KEY_FETCH_FAILED;
	if (typeof doFetch !== 'function') throw new VerifierError(code, 'fetch is not available');
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), o.timeoutMs ?? DEFAULT_TIMEOUT_MS);
	try {
		let current = url;
		for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
			const u = assertUrlAllowed(current, o.allowInsecureHttp);
			const res = await doFetch(u.href, {
				method: 'GET',
				headers: { accept: 'application/json' },
				redirect: 'manual',
				credentials: 'omit',
				signal: controller.signal,
			});
			if (res.type === 'opaqueredirect') {
				throw new VerifierError(code, 'The server redirected and this environment cannot follow redirects safely; use the final URL');
			}
			if (res.status >= 300 && res.status < 400) {
				const loc = res.headers.get('location');
				if (!loc) throw new VerifierError(code, 'Redirect without Location');
				current = new URL(loc, u).href;
				continue;
			}
			if (!res.ok) throw new VerifierError(code, `HTTP ${res.status}`);
			const bytes = await readLimited(res, o.maxBytes ?? DEFAULT_MAX_BYTES);
			return new TextDecoder().decode(bytes);
		}
		throw new VerifierError(code, 'Too many redirects');
	} catch (e) {
		if (e instanceof VerifierError) throw e;
		const aborted = e && typeof e === 'object' && /** @type {any} */ (e).name === 'AbortError';
		throw new VerifierError(code, aborted ? 'Request timed out' : 'Request failed');
	} finally {
		clearTimeout(timer);
	}
}

async function fetchJsonLimited(url, o) {
	const text = await fetchTextLimited(url, o);
	try {
		return JSON.parse(text);
	} catch {
		throw new VerifierError(o?.errorCode ?? REASONS.JWKS_INVALID, 'Response is not valid JSON');
	}
}

// ---------------------------------------------------------------------------
// Status list decoding
// ---------------------------------------------------------------------------

/**
 * Decode a status list's `encodedList`: multibase base64url ("u" prefix) of GZIP data.
 * Output is capped at 8 MiB so a malicious list cannot expand without bound.
 * @param {string} encoded
 * @returns {Promise<Uint8Array>}
 */
export async function decodeEncodedList(encoded) {
	if (typeof encoded !== 'string' || !encoded.startsWith('u')) {
		throw new VerifierError(REASONS.STATUS_LIST_INVALID, 'encodedList must be multibase base64url (prefix "u")');
	}
	let gz;
	try {
		gz = base64url.decode(encoded.slice(1));
	} catch {
		throw new VerifierError(REASONS.STATUS_LIST_INVALID, 'encodedList is not valid base64url');
	}
	if (typeof DecompressionStream === 'undefined') {
		throw new VerifierError(REASONS.STATUS_LIST_INVALID, 'DecompressionStream is not available in this environment');
	}
	const ds = new DecompressionStream('gzip');
	const writer = ds.writable.getWriter();
	// Errors surface on the readable side; never await the writer (it can stall under backpressure).
	writer.write(gz).then(() => writer.close()).catch(() => {});
	const reader = ds.readable.getReader();
	const chunks = [];
	let total = 0;
	try {
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			total += value.length;
			if (total > MAX_DECODED_BYTES) {
				await reader.cancel().catch(() => {});
				throw new VerifierError(REASONS.STATUS_LIST_INVALID, 'Status list is too large');
			}
			chunks.push(value);
		}
	} catch (e) {
		if (e instanceof VerifierError) throw e;
		throw new VerifierError(REASONS.STATUS_LIST_INVALID, 'Status list is not valid GZIP data');
	}
	const out = new Uint8Array(total);
	let off = 0;
	for (const c of chunks) {
		out.set(c, off);
		off += c.length;
	}
	return out;
}

/**
 * Bit `index` of a bitstring; index 0 is the most significant bit of byte 0.
 * @param {Uint8Array} bytes @param {number} index
 */
export function getStatusBit(bytes, index) {
	return ((bytes[index >> 3] >> (7 - (index & 7))) & 1) === 1;
}

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

function toNowMs(now) {
	if (now instanceof Date) return now.getTime();
	if (typeof now === 'number' && Number.isFinite(now)) return now;
	return Date.now();
}

const isoFromSec = v => (typeof v === 'number' && Number.isFinite(v) ? new Date(v * 1000).toISOString() : undefined);

/**
 * Verify a compact JWS against a set of trusted keys. Signature only; claims are checked by the caller.
 * @returns {Promise<{ payloadBytes: Uint8Array, header: Record<string, any>, key: TrustedKey }>}
 */
async function verifySignature(jws, keys) {
	let header;
	try {
		header = decodeProtectedHeader(jws);
	} catch {
		throw new VerifierError(REASONS.MALFORMED_TOKEN, 'Not a valid compact JWS');
	}
	if (typeof header.alg !== 'string' || !ALLOWED_ALGS.includes(header.alg)) {
		throw new VerifierError(REASONS.ALG_NOT_ALLOWED, `Algorithm ${String(header.alg)} is not allowed`);
	}
	const alg = header.alg;
	// Candidate keys: exact kid match when the token names one; otherwise every key of a compatible algorithm (legacy tokens).
	const candidates =
		header.kid !== undefined
			? keys.filter(k => k.kid === header.kid)
			: keys.filter(k => !k.alg || k.alg === alg);
	if (candidates.length === 0) throw new VerifierError(REASONS.UNKNOWN_KEY, header.kid !== undefined ? `No trusted key with kid ${String(header.kid)}` : 'No trusted key for this algorithm');
	let lastSignatureError = false;
	for (const tk of candidates.slice(0, 16)) {
		if (tk.alg && tk.alg !== alg) {
			lastSignatureError = true;
			continue;
		}
		try {
			const key = await importTrustedKey(tk, alg);
			const { payload } = await compactVerify(jws, key, { algorithms: [alg] });
			return { payloadBytes: payload, header, key: tk };
		} catch (e) {
			const name = e && typeof e === 'object' ? /** @type {any} */ (e).code : undefined;
			if (name === 'ERR_JWS_INVALID') throw new VerifierError(REASONS.MALFORMED_TOKEN, 'Not a valid compact JWS');
			lastSignatureError = true;
		}
	}
	throw new VerifierError(lastSignatureError ? REASONS.INVALID_SIGNATURE : REASONS.UNKNOWN_KEY, 'Signature verification failed');
}

function parsePayload(bytes) {
	try {
		const p = JSON.parse(new TextDecoder().decode(bytes));
		if (!p || typeof p !== 'object' || Array.isArray(p)) throw new Error('not an object');
		return p;
	} catch {
		throw new VerifierError(REASONS.INVALID_PAYLOAD, 'Signed payload is not a JSON object');
	}
}

/** exp / nbf (and numeric sanity of iat) against `nowSec`. Throws VerifierError. */
function checkTimes(payload, nowSec, tol) {
	for (const k of ['exp', 'nbf', 'iat']) {
		if (payload[k] !== undefined && (typeof payload[k] !== 'number' || !Number.isFinite(payload[k]))) {
			throw new VerifierError(REASONS.INVALID_CLAIMS, `"${k}" must be a number`);
		}
	}
	if (payload.nbf !== undefined && payload.nbf > nowSec + tol) throw new VerifierError(REASONS.NOT_YET_VALID, 'Credential is not valid yet');
	if (payload.exp !== undefined && payload.exp <= nowSec - tol) throw new VerifierError(REASONS.EXPIRED, 'Credential has expired');
}

function parseStatusEntry(vc, allowInsecureHttp) {
	const raw = vc.credentialStatus;
	const list = Array.isArray(raw) ? raw : [raw];
	const e = list.find(x => x && typeof x === 'object' && x.type === 'BitstringStatusListEntry' && x.statusPurpose === 'revocation');
	if (!e) throw new VerifierError(REASONS.STATUS_ENTRY_INVALID, 'credentialStatus has no BitstringStatusListEntry for revocation');
	if (typeof e.statusListIndex !== 'string' || !/^\d{1,9}$/.test(e.statusListIndex)) {
		throw new VerifierError(REASONS.STATUS_ENTRY_INVALID, 'statusListIndex must be a decimal string');
	}
	if (typeof e.statusListCredential !== 'string') throw new VerifierError(REASONS.STATUS_ENTRY_INVALID, 'statusListCredential must be a URL');
	try {
		assertUrlAllowed(e.statusListCredential, allowInsecureHttp);
	} catch {
		throw new VerifierError(REASONS.STATUS_ENTRY_INVALID, 'statusListCredential must be an https URL');
	}
	return { index: Number(e.statusListIndex), url: e.statusListCredential };
}

async function checkRevocation({ vc, issuer, keys, opts, nowSec, tol, checks }) {
	const entry = parseStatusEntry(vc, opts.allowInsecureHttp);
	let fetched;
	try {
		if (opts.statusListFetch) {
			fetched = await opts.statusListFetch(entry.url);
		} else {
			// Either the {jws, id, updatedAt} envelope served by CampusSync or a bare compact JWS.
			const text = (await fetchTextLimited(entry.url, { ...opts, errorCode: REASONS.STATUS_LIST_UNAVAILABLE })).trim();
			fetched = text.startsWith('{') ? JSON.parse(text) : text;
		}
	} catch (e) {
		if (e instanceof VerifierError && e.code === REASONS.STATUS_LIST_UNAVAILABLE) throw e;
		throw new VerifierError(REASONS.STATUS_LIST_UNAVAILABLE, 'Could not obtain the status list');
	}
	const listJws = typeof fetched === 'string' ? fetched.trim() : fetched && typeof fetched === 'object' ? fetched.jws : undefined;
	if (typeof listJws !== 'string' || !listJws) throw new VerifierError(REASONS.STATUS_LIST_INVALID, 'Status list response has no JWS');

	let verified;
	try {
		verified = await verifySignature(listJws, keys);
	} catch (e) {
		if (e instanceof VerifierError && e.code === REASONS.MALFORMED_TOKEN) throw new VerifierError(REASONS.STATUS_LIST_INVALID, 'Status list is not a valid JWS');
		throw new VerifierError(REASONS.STATUS_LIST_SIGNATURE_INVALID, 'Status list signature could not be verified with the issuer keys');
	}
	const lp = parsePayload(verified.payloadBytes);
	try {
		checkTimes(lp, nowSec, tol);
	} catch {
		throw new VerifierError(REASONS.STATUS_LIST_INVALID, 'Status list is outside its validity window');
	}
	if (lp.iss !== issuer) throw new VerifierError(REASONS.STATUS_LIST_INVALID, 'Status list was issued by a different issuer');
	if (typeof opts.maxStatusListAgeSec === 'number') {
		if (typeof lp.iat !== 'number' || nowSec - lp.iat > opts.maxStatusListAgeSec) {
			throw new VerifierError(REASONS.STATUS_LIST_STALE, 'Status list is older than the allowed age');
		}
	}
	const lvc = lp.vc;
	const subj = lvc && typeof lvc === 'object' ? lvc.credentialSubject : undefined;
	const types = lvc && Array.isArray(lvc.type) ? lvc.type : [];
	if (
		!subj ||
		!types.includes('BitstringStatusListCredential') ||
		subj.type !== 'BitstringStatusList' ||
		subj.statusPurpose !== 'revocation' ||
		subj.id !== `${entry.url}#list` ||
		(lvc.id !== undefined && lvc.id !== entry.url)
	) {
		throw new VerifierError(REASONS.STATUS_LIST_INVALID, 'Status list does not match the credential status entry');
	}
	const bytes = await decodeEncodedList(subj.encodedList);
	if (entry.index >= bytes.length * 8) throw new VerifierError(REASONS.STATUS_INDEX_OUT_OF_RANGE, 'Status index is outside the list');
	const revoked = getStatusBit(bytes, entry.index);
	checks.push({ id: 'status', ok: !revoked, detail: revoked ? `bit ${entry.index} is set` : `bit ${entry.index} is clear (list issued ${isoFromSec(lp.iat) ?? 'unknown'})` });
	return { revoked, listUrl: entry.url, index: entry.index, listIssuedAt: isoFromSec(lp.iat) };
}

/**
 * @typedef {Object} VerifyOptions
 * @property {{ keys: unknown[] }} [jwks] Issuer public keys (JWKS).
 * @property {unknown} [didDocument] Issuer did:web document (alternative to jwks).
 * @property {string} [jwksUrl] https URL to fetch the JWKS from.
 * @property {string} [expectedIssuer] Require payload `iss` to equal this DID/string.
 * @property {(url: string) => Promise<string | { jws: string }>} [statusListFetch] Supplies the status list (offline use / tests).
 * @property {boolean} [checkStatus] Default true. When false, `credentialStatus` is ignored (signature-only).
 * @property {number} [maxStatusListAgeSec] Reject status lists whose `iat` is older than this.
 * @property {Date | number} [now] Verification time.
 * @property {number} [clockToleranceSec] Default 30.
 * @property {typeof fetch} [fetch] fetch implementation (default global).
 * @property {number} [timeoutMs] Default 5000.
 * @property {number} [maxBytes] Default 1 000 000.
 * @property {boolean} [allowInsecureHttp] Allow http:// URLs (local testing only).
 */

/**
 * Verify a CampusSync credential offline.
 *
 * @param {unknown} input compact JWS, JSON string, or credential object with `proof.jws`
 * @param {VerifyOptions} [opts]
 */
export async function verifyCredentialOffline(input, opts = {}) {
	/** @type {{id: string, ok: boolean, detail?: string}[]} */
	const checks = [];
	const out = {
		valid: false,
		reason: REASONS.MALFORMED_TOKEN,
		signatureVerified: false,
		issuer: undefined,
		subject: undefined,
		credentialId: undefined,
		issuedAt: undefined,
		expiresAt: undefined,
		keyId: undefined,
		revoked: null,
		credential: undefined,
		statusList: undefined,
		checks,
	};
	const fail = (reason, id, detail) => {
		if (id) checks.push({ id, ok: false, detail });
		out.valid = false;
		out.reason = reason;
		return out;
	};

	const nowMs = toNowMs(opts.now);
	const nowSec = Math.floor(nowMs / 1000);
	const tol = opts.clockToleranceSec ?? DEFAULT_CLOCK_TOLERANCE_SEC;

	try {
		// 1. input -> compact JWS
		if (input === undefined || input === null || input === '') return fail(REASONS.MISSING_INPUT, 'format', 'No credential supplied');
		const jws = extractJws(input);
		if (!jws || jws.length > MAX_JWS_CHARS) return fail(REASONS.MALFORMED_TOKEN, 'format', 'Could not find a compact JWS in the input');
		let header;
		let unverified;
		try {
			header = decodeProtectedHeader(jws);
			unverified = decodeJwt(jws);
		} catch {
			return fail(REASONS.MALFORMED_TOKEN, 'format', 'Not a valid compact JWS with a JSON payload');
		}
		checks.push({ id: 'format', ok: true, detail: 'compact JWS' });

		// 2. algorithm allow-list
		if (typeof header.alg !== 'string' || !ALLOWED_ALGS.includes(header.alg)) {
			return fail(REASONS.ALG_NOT_ALLOWED, 'algorithm', `alg ${String(header.alg)} is not one of ${ALLOWED_ALGS.join(', ')}`);
		}
		checks.push({ id: 'algorithm', ok: true, detail: header.alg });

		// 3. trusted keys (never taken from the token itself: jwk/jku/x5u headers are ignored)
		let keys;
		let didFromDoc;
		let source;
		try {
			if (opts.jwks) {
				keys = keysFromJwks(opts.jwks);
				source = 'supplied JWKS';
			} else if (opts.didDocument) {
				({ keys, did: didFromDoc } = keysFromDidDocument(opts.didDocument));
				source = 'supplied DID document';
			} else {
				const url = opts.jwksUrl ?? jwksUrlFromDid(typeof unverified.iss === 'string' ? unverified.iss : undefined);
				if (!url) return fail(REASONS.NO_KEY_SOURCE, 'key_source', 'No JWKS supplied and the issuer is not a host-only did:web');
				keys = keysFromJwks(await fetchJsonLimited(url, opts));
				source = opts.jwksUrl ? `fetched ${url}` : `fetched ${url} (derived from the unverified "iss" claim)`;
			}
		} catch (e) {
			if (e instanceof VerifierError) return fail(e.code, 'key_source', e.message);
			throw e;
		}
		checks.push({ id: 'key_source', ok: true, detail: source });

		// 4. signature
		let verified;
		try {
			verified = await verifySignature(jws, keys);
		} catch (e) {
			if (e instanceof VerifierError) return fail(e.code, e.code === REASONS.UNKNOWN_KEY ? 'key' : 'signature', e.message);
			throw e;
		}
		out.signatureVerified = true;
		out.keyId = verified.key.kid;
		checks.push({ id: 'key', ok: true, detail: `kid ${verified.key.kid ?? '(none)'}` });
		checks.push({ id: 'signature', ok: true, detail: `${header.alg} signature valid` });

		// From here on everything comes from the SIGNED payload.
		const payload = parsePayload(verified.payloadBytes);
		const vc = payload.vc;
		out.issuer = typeof payload.iss === 'string' ? payload.iss : typeof vc?.issuer === 'string' ? vc.issuer : undefined;
		out.issuedAt = isoFromSec(payload.iat);
		out.expiresAt = isoFromSec(payload.exp);

		// 5. time window
		try {
			checkTimes(payload, nowSec, tol);
		} catch (e) {
			if (e instanceof VerifierError) return fail(e.code, 'validity', e.message);
			throw e;
		}
		checks.push({
			id: 'validity',
			ok: true,
			detail: payload.exp === undefined ? 'no expiry in this credential' : `valid until ${out.expiresAt}`,
		});

		// 6. issuer binding
		if (opts.expectedIssuer !== undefined && payload.iss !== opts.expectedIssuer) {
			return fail(REASONS.ISSUER_MISMATCH, 'issuer', `issuer is ${String(payload.iss)}, expected ${opts.expectedIssuer}`);
		}
		if (didFromDoc !== undefined && typeof payload.iss === 'string' && payload.iss !== didFromDoc) {
			return fail(REASONS.ISSUER_MISMATCH, 'issuer', 'issuer does not match the supplied DID document');
		}
		if (typeof payload.iss === 'string' && typeof vc?.issuer === 'string' && payload.iss !== vc.issuer) {
			return fail(REASONS.ISSUER_MISMATCH, 'issuer', 'JWT iss and credential issuer differ');
		}
		checks.push({ id: 'issuer', ok: true, detail: opts.expectedIssuer !== undefined ? 'matches the expected issuer' : `${out.issuer ?? '(none)'} (not pinned)` });

		// 7. payload shape
		const subjectObj = vc && typeof vc === 'object' ? vc.credentialSubject : undefined;
		if (!vc || typeof vc !== 'object' || typeof vc.id !== 'string' || !subjectObj || typeof subjectObj !== 'object') {
			return fail(REASONS.INVALID_PAYLOAD, 'payload', 'Signed payload has no credential with id and credentialSubject');
		}
		if (payload.jti !== undefined && payload.jti !== vc.id) return fail(REASONS.INVALID_PAYLOAD, 'payload', 'jti does not match the credential id');
		out.credentialId = vc.id;
		out.subject = typeof payload.sub === 'string' ? payload.sub : typeof subjectObj.id === 'string' ? subjectObj.id : undefined;
		out.credential = vc;
		checks.push({ id: 'payload', ok: true, detail: `credential ${vc.id}` });

		// 8. revocation
		if (opts.checkStatus !== false && vc.credentialStatus) {
			try {
				const r = await checkRevocation({ vc, issuer: payload.iss, keys, opts, nowSec, tol, checks });
				out.statusList = { url: r.listUrl, index: r.index, issuedAt: r.listIssuedAt };
				out.revoked = r.revoked;
				if (r.revoked) return fail(REASONS.REVOKED);
			} catch (e) {
				if (e instanceof VerifierError) return fail(e.code, 'status', e.message);
				throw e;
			}
		} else {
			checks.push({
				id: 'status',
				ok: true,
				detail: opts.checkStatus === false ? 'skipped by caller' : 'credential has no credentialStatus entry (revocation cannot be checked offline)',
			});
		}

		out.valid = true;
		out.reason = REASONS.OK;
		return out;
	} catch (e) {
		// Unexpected: fail closed with a generic code; no internal text leaks.
		return fail(REASONS.INVALID_PAYLOAD, 'internal', e instanceof Error ? e.name : 'unexpected error');
	}
}
