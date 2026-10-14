export declare const ALLOWED_ALGS: readonly ['EdDSA', 'ES256', 'RS256'];

export declare const REASONS: Readonly<{
	OK: 'ok';
	MISSING_INPUT: 'missing_input';
	MALFORMED_TOKEN: 'malformed_token';
	ALG_NOT_ALLOWED: 'alg_not_allowed';
	NO_KEY_SOURCE: 'no_key_source';
	KEY_FETCH_FAILED: 'key_fetch_failed';
	JWKS_INVALID: 'jwks_invalid';
	UNKNOWN_KEY: 'unknown_key';
	INVALID_SIGNATURE: 'invalid_signature';
	EXPIRED: 'expired';
	NOT_YET_VALID: 'not_yet_valid';
	INVALID_CLAIMS: 'invalid_claims';
	ISSUER_MISMATCH: 'issuer_mismatch';
	INVALID_PAYLOAD: 'invalid_payload';
	STATUS_ENTRY_INVALID: 'status_entry_invalid';
	STATUS_LIST_UNAVAILABLE: 'status_list_unavailable';
	STATUS_LIST_INVALID: 'status_list_invalid';
	STATUS_LIST_SIGNATURE_INVALID: 'status_list_signature_invalid';
	STATUS_LIST_STALE: 'status_list_stale';
	STATUS_INDEX_OUT_OF_RANGE: 'status_index_out_of_range';
	REVOKED: 'revoked';
}>;

export type ReasonCode = (typeof REASONS)[keyof typeof REASONS];

export interface PublicJwk {
	kty: string;
	kid?: string;
	alg?: string;
	use?: string;
	crv?: string;
	x?: string;
	y?: string;
	n?: string;
	e?: string;
	[member: string]: unknown;
}

export interface TrustedKey {
	kid: string | undefined;
	alg: string | undefined;
	jwk: Record<string, unknown>;
}

export interface VerifyOptions {
	/** Issuer public keys (JWKS). */
	jwks?: { keys: unknown[] };
	/** Issuer did:web document (alternative to `jwks`). */
	didDocument?: unknown;
	/** https URL to fetch the JWKS from. */
	jwksUrl?: string;
	/** Require the signed `iss` to equal this value. */
	expectedIssuer?: string;
	/** Supplies the status list (offline use / tests). Returns the compact JWS or `{ jws }`. */
	statusListFetch?: (url: string) => Promise<string | { jws: string }>;
	/** Default true. When false, `credentialStatus` is ignored. */
	checkStatus?: boolean;
	/** Reject status lists whose `iat` is older than this many seconds. */
	maxStatusListAgeSec?: number;
	now?: Date | number;
	/** Default 30. */
	clockToleranceSec?: number;
	fetch?: typeof fetch;
	/** Default 5000. */
	timeoutMs?: number;
	/** Default 1 000 000. */
	maxBytes?: number;
	/** Allow http:// URLs (local testing only). */
	allowInsecureHttp?: boolean;
}

export interface VerifyCheck {
	id: string;
	ok: boolean;
	detail?: string;
}

export interface VerifyResult {
	valid: boolean;
	reason: ReasonCode;
	/** True once the signature has been verified; fields below are only filled from the signed payload after that. */
	signatureVerified: boolean;
	issuer?: string;
	subject?: string;
	credentialId?: string;
	issuedAt?: string;
	expiresAt?: string;
	keyId?: string;
	/** true / false when the status list was consulted; null when the credential has no status entry or the check was skipped. */
	revoked: boolean | null;
	/** The signed `vc` object. */
	credential?: Record<string, unknown>;
	statusList?: { url: string; index: number; issuedAt?: string };
	checks: VerifyCheck[];
}

export declare function verifyCredentialOffline(input: unknown, opts?: VerifyOptions): Promise<VerifyResult>;
export declare function extractJws(input: unknown): string | null;
export declare function jwksUrlFromDid(did: string | undefined): string | null;
export declare function keysFromJwks(jwks: unknown): TrustedKey[];
export declare function keysFromDidDocument(doc: unknown): { keys: TrustedKey[]; did: string | undefined };
export declare function fetchTextLimited(
	url: string,
	o?: { fetch?: typeof fetch; timeoutMs?: number; maxBytes?: number; allowInsecureHttp?: boolean; errorCode?: string }
): Promise<string>;
export declare function decodeEncodedList(encoded: string): Promise<Uint8Array>;
export declare function getStatusBit(bytes: Uint8Array, index: number): boolean;
