import { SignJWT, importJWK, jwtVerify, type JWK, type JWTPayload, type JWTVerifyResult } from 'jose';
import { randomUUID } from 'crypto';
import type { VerifiableCredential } from '../types/index';
import { getIssuerJwkJson } from '@/lib/envServer';

export interface CreateVcParams {
	issuerDid: string;
	verificationMethod: string;
	credential: Omit<VerifiableCredential, 'proof' | 'issuanceDate' | 'id' | '@context' | 'type' | 'issuer'> & {
		credentialSubject: VerifiableCredential['credentialSubject'];
	};
}

/** A credential that is guaranteed to carry a compact JWS proof. */
export type SignedVerifiableCredential = VerifiableCredential & {
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

/** The issuer's public JWK (with kid, alg, use:'sig'), derived from VC_ISSUER_JWK. */
export async function getIssuerPublicJwk(): Promise<JWK & { alg: AllowedVcAlg }> {
	const jwk = await getIssuerJwk();
	if (isPlaceholderJwk(jwk)) throw new Error('Issuer key is a development placeholder');
	const pub = toPublicJwk(jwk);
	assertAllowedAlg(pub.alg);
	return pub as JWK & { alg: AllowedVcAlg };
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
				verificationMethod: params.verificationMethod,
				jws: 'development-mock-jws-token',
			},
		};
	}

	// Production VC signing
	assertAllowedAlg(jwk.alg);
	const key = await importJWK(jwk, jwk.alg);

	const nowMs = Date.now();
	const nowSec = Math.floor(nowMs / 1000);
	const expSec = nowSec + getVcValidityDays() * 86400;
	const issuanceDate = new Date(nowMs).toISOString();
	const vcId = `urn:uuid:${randomUUID()}`;

	const unsignedVc: VerifiableCredential = {
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
	};

	let builder = new SignJWT({ vc: unsignedVc })
		.setProtectedHeader({ alg: jwk.alg, kid: jwk.kid })
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
			verificationMethod: params.verificationMethod,
			jws,
		},
	};
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
