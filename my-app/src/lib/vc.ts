import {
	SignJWT,
	importJWK,
	jwtVerify,
	calculateJwkThumbprint,
	decodeProtectedHeader,
	errors as joseErrors,
	type JWK,
	type JWTPayload,
	type JWTVerifyResult,
} from 'jose';
import { randomUUID } from 'crypto';
import type { VerifiableCredential } from '../types/index';
import { getIssuerJwkJson } from '@/lib/envServer';

/** `credentialStatus` entry embedded in a signed credential (see src/lib/statusList.ts). */
export interface CredentialStatusEntry {
	id: string;
	type: 'BitstringStatusListEntry';
	statusPurpose: 'revocation';
	statusListIndex: string;
	statusListCredential: string;
}

export interface CreateVcParams {
	issuerDid: string;
	/**
	 * Optional override. By default the proof's verificationMethod is `${issuerDid}#${kid}`,
	 * where kid is the key id of the key that actually signs (see getIssuerKeyId).
	 */
	verificationMethod?: string;
	/** Embedded inside the SIGNED payload when present. */
	credentialStatus?: CredentialStatusEntry;
	credential: Omit<VerifiableCredential, 'proof' | 'issuanceDate' | 'id' | '@context' | 'type' | 'issuer'> & {
		credentialSubject: VerifiableCredential['credentialSubject'];
	};
}

/** A credential that is guaranteed to carry a compact JWS proof. */
export type SignedVerifiableCredential = VerifiableCredential & {
	credentialStatus?: CredentialStatusEntry;
	proof: {
		type: string;
		created: string;
		proofPurpose: 'assertionMethod';
		verificationMethod: string;
		jws: string;
	};
};

/** Signature algorithms the issuer may use / the verifier will accept. */
export const ALLOWED_VC_ALGS = ['EdDSA', 'ES256', 'RS256'] as const;
export type AllowedVcAlg = (typeof ALLOWED_VC_ALGS)[number];

const DEFAULT_VALIDITY_DAYS = 730;
const PLACEHOLDER_N = 'placeholder-n-value-for-development';

export async function getIssuerJwk(): Promise<JWK> {
	const jwkJson = getIssuerJwkJson();
	try {
		const jwk = JSON.parse(jwkJson);
		return jwk as JWK;
	} catch (error) {
		throw new Error(`Invalid VC_ISSUER_JWK format: ${error instanceof Error ? error.message : 'Unknown error'}`);
	}
}

/** True when the configured key is the development placeholder (not a usable key). */
export function isPlaceholderJwk(jwk: JWK): boolean {
	return jwk.n === PLACEHOLDER_N;
}

/** Number of days a newly issued credential stays valid (VC_VALIDITY_DAYS, default 730). */
export function getVcValidityDays(): number {
	const raw = process.env.VC_VALIDITY_DAYS;
	if (!raw) return DEFAULT_VALIDITY_DAYS;
	const n = Number(raw);
	if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) return DEFAULT_VALIDITY_DAYS;
	return n;
}

/** JWK members that only ever appear in private / symmetric keys. */
export const PRIVATE_JWK_MEMBERS = ['d', 'p', 'q', 'dp', 'dq', 'qi', 'k', 'oth'] as const;

/** A public verification key with the members a verifier needs. */
export type PublicIssuerJwk = JWK & { alg: AllowedVcAlg; kid: string; use: 'sig' };

/**
 * Key id used in the JWS header, the JWKS and the DID document.
 * An explicit `kid` on the configured JWK wins; otherwise the RFC 7638 JWK thumbprint
 * (SHA-256, base64url) of the PUBLIC key members is used, so the same key always gets
 * the same kid no matter which process computes it.
 */
export async function getIssuerKeyId(jwk: JWK): Promise<string> {
	if (typeof jwk.kid === 'string' && jwk.kid) return jwk.kid;
	return calculateJwkThumbprint(toPublicJwk(jwk), 'sha256');
}

function inferAlg(jwk: JWK): AllowedVcAlg | undefined {
	if (jwk.kty === 'OKP' && jwk.crv === 'Ed25519') return 'EdDSA';
	if (jwk.kty === 'EC' && jwk.crv === 'P-256') return 'ES256';
	if (jwk.kty === 'RSA') return 'RS256';
	return undefined;
}

/** Public JWK with kid (explicit or thumbprint), alg and use:'sig'. Rejects private members when `rejectPrivate`. */
async function normalizePublicJwk(jwk: JWK, opts: { rejectPrivate: boolean; inferMissingAlg: boolean }): Promise<PublicIssuerJwk> {
	if (opts.rejectPrivate) {
		for (const m of PRIVATE_JWK_MEMBERS) {
			if (m in jwk) throw new Error(`Key contains private member "${m}"; only public keys are allowed`);
		}
	}
	const pub = toPublicJwk(jwk);
	if (!pub.alg && opts.inferMissingAlg) pub.alg = inferAlg(pub);
	assertAllowedAlg(pub.alg);
	pub.kid = await getIssuerKeyId(pub);
	return pub as PublicIssuerJwk;
}

/**
 * Previous issuer PUBLIC keys (VC_ISSUER_PREVIOUS_PUBLIC_JWKS, a JSON array). They let credentials
 * signed before a key rotation keep verifying. Any entry that contains a private member is rejected
 * (throws) rather than silently stripped, so a misplaced private key is noticed.
 * Returns [] when the variable is unset/empty.
 */
export async function getPreviousPublicJwks(): Promise<PublicIssuerJwk[]> {
	const raw = process.env.VC_ISSUER_PREVIOUS_PUBLIC_JWKS;
	if (!raw || !raw.trim()) return [];
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		throw new Error('VC_ISSUER_PREVIOUS_PUBLIC_JWKS is not valid JSON');
	}
	if (!Array.isArray(parsed)) throw new Error('VC_ISSUER_PREVIOUS_PUBLIC_JWKS must be a JSON array of public JWKs');
	const out: PublicIssuerJwk[] = [];
	for (const [i, entry] of parsed.entries()) {
		if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
			throw new Error(`VC_ISSUER_PREVIOUS_PUBLIC_JWKS[${i}] is not a JWK object`);
		}
		try {
			out.push(await normalizePublicJwk(entry as JWK, { rejectPrivate: true, inferMissingAlg: true }));
		} catch (e) {
			throw new Error(`VC_ISSUER_PREVIOUS_PUBLIC_JWKS[${i}] invalid: ${e instanceof Error ? e.message : 'unknown'}`);
		}
	}
	return out;
}

/**
 * Derive the PUBLIC verification key from a (possibly private) JWK.
 * Only public members are copied, so private material (d, p, q, dp, dq, qi, k, oth...)
 * can never leak, regardless of what the input contains.
 */
export function toPublicJwk(jwk: JWK): JWK {
	const pub: JWK = { kty: jwk.kty };
	switch (jwk.kty) {
		case 'OKP':
			pub.crv = jwk.crv;
			pub.x = jwk.x;
			break;
		case 'EC':
			pub.crv = jwk.crv;
			pub.x = jwk.x;
			pub.y = jwk.y;
			break;
		case 'RSA':
			pub.n = jwk.n;
			pub.e = jwk.e;
			break;
		default:
			throw new Error('Unsupported issuer key type');
	}
	if (jwk.kid) pub.kid = jwk.kid;
	if (jwk.alg) pub.alg = jwk.alg;
	pub.use = 'sig';
	return pub;
}

function assertAllowedAlg(alg: unknown): asserts alg is AllowedVcAlg {
	if (typeof alg !== 'string' || !(ALLOWED_VC_ALGS as readonly string[]).includes(alg)) {
		throw new Error('Issuer key must declare alg EdDSA, ES256 or RS256');
	}
}

/** The CURRENT issuer public JWK (with kid, alg, use:'sig'), derived from VC_ISSUER_JWK. */
export async function getIssuerPublicJwk(): Promise<PublicIssuerJwk> {
	const jwk = await getIssuerJwk();
	if (isPlaceholderJwk(jwk)) throw new Error('Issuer key is a development placeholder');
	return normalizePublicJwk(jwk, { rejectPrivate: false, inferMissingAlg: false });
}

/**
 * All keys verifiers should trust for this issuer: the current key FIRST, then the previous
 * public keys. A previous key with the same kid as the current key is dropped when it is the
 * same key and rejected (throws) when it is a different key.
 */
export async function getIssuerPublicJwks(): Promise<PublicIssuerJwk[]> {
	const current = await getIssuerPublicJwk();
	const keys: PublicIssuerJwk[] = [current];
	for (const prev of await getPreviousPublicJwks()) {
		const clash = keys.find(k => k.kid === prev.kid);
		if (clash) {
			const same =
				(await calculateJwkThumbprint(toPublicJwk(clash), 'sha256')) ===
				(await calculateJwkThumbprint(toPublicJwk(prev), 'sha256'));
			if (!same) throw new Error(`VC_ISSUER_PREVIOUS_PUBLIC_JWKS contains kid "${prev.kid}" which is already used by a different key`);
			continue;
		}
		keys.push(prev);
	}
	return keys;
}

export async function signCredential(params: CreateVcParams): Promise<SignedVerifiableCredential> {
	const jwk = await getIssuerJwk();

	// Check if this is a development JWK with placeholder values
	const isDevelopmentJWK = isPlaceholderJwk(jwk);

	if (isDevelopmentJWK) {
		// Never emit unsigned mock credentials outside local development
		if (process.env.NODE_ENV === 'production') {
			throw new Error('VC_ISSUER_JWK is a development placeholder; refusing to issue credentials in production');
		}
		console.warn('[WARNING] Using development JWK - VCs will not be cryptographically valid');
		// Return a mock VC for development
		const issuanceDate = new Date().toISOString();
		const vcId = `urn:uuid:${randomUUID()}`;

		const unsignedVc: VerifiableCredential = {
			'@context': [
				'https://www.w3.org/2018/credentials/v1',
				{ AchievementCredential: 'https://purl.imsglobal.org/pec/v1' },
			],
			type: ['VerifiableCredential', 'AchievementCredential'],
			issuer: params.issuerDid,
			issuanceDate,
			id: vcId,
			credentialSubject: params.credential.credentialSubject,
		};

		return {
			...unsignedVc,
			proof: {
				type: 'JsonWebSignature2020',
				created: issuanceDate,
				proofPurpose: 'assertionMethod',
				verificationMethod: params.verificationMethod ?? `${params.issuerDid}#keys-1`,
				jws: 'development-mock-jws-token',
			},
		};
	}

	// Production VC signing
	assertAllowedAlg(jwk.alg);
	const key = await importJWK(jwk, jwk.alg);
	const kid = await getIssuerKeyId(jwk);

	const nowMs = Date.now();
	const nowSec = Math.floor(nowMs / 1000);
	const expSec = nowSec + getVcValidityDays() * 86400;
	const issuanceDate = new Date(nowMs).toISOString();
	const vcId = `urn:uuid:${randomUUID()}`;

	const unsignedVc: VerifiableCredential & { credentialStatus?: CredentialStatusEntry } = {
		'@context': [
			'https://www.w3.org/2018/credentials/v1',
			{ AchievementCredential: 'https://purl.imsglobal.org/pec/v1' },
		],
		type: ['VerifiableCredential', 'AchievementCredential'],
		issuer: params.issuerDid,
		issuanceDate,
		expirationDate: new Date(expSec * 1000).toISOString(),
		id: vcId,
		credentialSubject: params.credential.credentialSubject,
		// Inside the signed payload, so it cannot be removed or altered without breaking the signature.
		...(params.credentialStatus ? { credentialStatus: params.credentialStatus } : {}),
	};

	let builder = new SignJWT({ vc: unsignedVc })
		.setProtectedHeader({ alg: jwk.alg, kid })
		.setIssuer(params.issuerDid)
		.setJti(vcId)
		.setIssuedAt(nowSec)
		.setNotBefore(nowSec)
		.setExpirationTime(expSec);
	const subjectId = params.credential.credentialSubject?.id;
	if (typeof subjectId === 'string' && subjectId) builder = builder.setSubject(subjectId);
	const jws = await builder.sign(key);

	return {
		...unsignedVc,
		proof: {
			type: 'JsonWebSignature2020',
			created: issuanceDate,
			proofPurpose: 'assertionMethod',
			verificationMethod: params.verificationMethod ?? `${params.issuerDid}#${kid}`,
			jws,
		},
	};
}

/**
 * Sign an arbitrary VC-shaped payload with the CURRENT issuer key (used for status-list
 * credentials). Same header rules as signCredential: alg from the key, `kid` always present.
 * Refuses the development placeholder key.
 */
export async function signVcPayload(
	vc: Record<string, unknown>,
	opts: { issuerDid: string; jti?: string; subject?: string; expiresInSec?: number }
): Promise<{ jws: string; kid: string }> {
	const jwk = await getIssuerJwk();
	if (isPlaceholderJwk(jwk)) throw new Error('Issuer key is a development placeholder');
	assertAllowedAlg(jwk.alg);
	const key = await importJWK(jwk, jwk.alg);
	const kid = await getIssuerKeyId(jwk);
	const nowSec = Math.floor(Date.now() / 1000);
	let builder = new SignJWT({ vc })
		.setProtectedHeader({ alg: jwk.alg, kid })
		.setIssuer(opts.issuerDid)
		.setIssuedAt(nowSec)
		.setNotBefore(nowSec);
	if (opts.jti) builder = builder.setJti(opts.jti);
	if (opts.subject) builder = builder.setSubject(opts.subject);
	if (opts.expiresInSec) builder = builder.setExpirationTime(nowSec + opts.expiresInSec);
	return { jws: await builder.sign(key), kid };
}

export interface VerifyJwsOptions {
	/** Expected `iss` claim; enforced when provided. */
	issuer?: string;
	/** Clock skew tolerance in seconds (default 30). */
	clockToleranceSec?: number;
	/** Verification "now" (tests). */
	currentDate?: Date;
}

/**
 * Verify a credential JWS. Accepts the issuer's PUBLIC or PRIVATE JWK; the
 * verification key is always the derived public key, and the accepted algorithm
 * is pinned to the key's own `alg` (restricted to EdDSA / ES256 / RS256).
 * `exp`/`nbf` are enforced when present (legacy credentials without `exp` verify).
 */
export async function verifyCredentialJws(
	jws: string,
	jwk: JWK,
	options: VerifyJwsOptions = {}
): Promise<JWTVerifyResult<JWTPayload>> {
	const pub = toPublicJwk(jwk);
	assertAllowedAlg(pub.alg);
	const key = await importJWK(pub, pub.alg);
	return jwtVerify(jws, key, {
		algorithms: [pub.alg],
		issuer: options.issuer,
		clockTolerance: options.clockToleranceSec ?? 30,
		currentDate: options.currentDate,
	});
}

/**
 * Verify a credential JWS against a key set (CURRENT key first, then previous public keys).
 *
 * - Token with a `kid` header: the key with that kid is used. An unknown kid fails with
 *   `JWKSNoMatchingKey`; there is never a fallback to a different key.
 * - Token WITHOUT a `kid` (legacy credentials): the current key is tried first, then the
 *   previous keys, in order. Whatever key verifies must still be one of the trusted keys.
 *
 * Returns the verification result plus the key that verified it.
 */
export async function verifyCredentialJwsWithKeys(
	jws: string,
	keys: JWK[],
	options: VerifyJwsOptions = {}
): Promise<JWTVerifyResult<JWTPayload> & { key: JWK }> {
	let kid: string | undefined;
	try {
		kid = decodeProtectedHeader(jws).kid;
	} catch {
		throw new joseErrors.JWSInvalid('Invalid JWS');
	}

	if (kid !== undefined) {
		const selected = keys.find(k => k.kid === kid);
		if (!selected) throw new joseErrors.JWKSNoMatchingKey();
		return { ...(await verifyCredentialJws(jws, selected, options)), key: selected };
	}

	let lastError: unknown = new joseErrors.JWKSNoMatchingKey();
	for (const candidate of keys) {
		try {
			return { ...(await verifyCredentialJws(jws, candidate, options)), key: candidate };
		} catch (e) {
			// Only a signature / algorithm mismatch means "try the next key"; claim errors
			// (expired, wrong issuer...) are properties of the token and end the search.
			if (!(e instanceof joseErrors.JWSSignatureVerificationFailed) && !(e instanceof joseErrors.JOSEAlgNotAllowed)) throw e;
			lastError = e;
		}
	}
	throw lastError;
}
