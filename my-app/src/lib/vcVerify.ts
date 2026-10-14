/**
 * Shared credential verification service.
 *
 * One code path for every public verification endpoint:
 *   1. obtain the JWS (directly, from a VC object, or by looking the VC up by id)
 *   2. verify the signature with the issuer's PUBLIC keys: the key is selected by the JWS `kid`
 *      from the current + previous (rotated-out) public keys; algorithm allow-list, pinned alg
 *   3. enforce exp / nbf when present (legacy credentials without exp still verify)
 *   4. look up revocation by the SIGNED credential id (`verifiable_credentials.status`)
 *      and FAIL CLOSED if the lookup errors or the credential is unknown
 *   5. when the signed payload carries a `credentialStatus` entry, ALSO check its bit in the
 *      database-held status list (can only turn a result into `revoked`; the status column
 *      stays authoritative; see src/lib/statusList.ts)
 *   6. return only fields taken from the signed payload
 *
 * Raw jose / database error text is never returned; failures map to stable `reason` codes.
 */
import { errors as joseErrors, type JWK, type JWTPayload } from 'jose';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getIssuerPublicJwks, verifyCredentialJwsWithKeys } from '@/lib/vc';
import { checkStatusBit, parseStatusEntry, type StatusListDb } from '@/lib/statusList';

export type VerifyStatus = 'active' | 'revoked' | 'unknown';

export type VerifyReason =
	| 'missing_input'
	| 'verifier_misconfigured'
	| 'malformed_token'
	| 'invalid_signature'
	| 'alg_not_allowed'
	| 'unknown_key'
	| 'expired'
	| 'not_yet_valid'
	| 'invalid_claims'
	| 'invalid_payload'
	| 'id_mismatch'
	| 'unknown_credential'
	| 'revocation_check_failed'
	| 'revoked'
	| 'inactive';

export interface VerifyInput {
	jws?: string;
	vc?: { proof?: { jws?: string } } | null;
	vcId?: string;
}

export interface VerifyResult {
	valid: boolean;
	reason?: VerifyReason;
	status: VerifyStatus;
	/** The signature-verified JWT payload (only present when the signature checked out). */
	payload?: JWTPayload;
	issuer?: string;
	issuedAt?: string;
	expiresAt?: string;
	credentialId?: string;
	/** `credentialSubject` taken from the signed payload, never from a client-supplied object. */
	credentialSubject?: Record<string, unknown>;
	revokedAt?: string | null;
	revokedReason?: string | null;
	/** Result of the status-list bit check; absent when the credential has no credentialStatus entry. */
	statusList?: 'clear' | 'unavailable';
}

export type StoreClient = Pick<SupabaseClient, 'from'>;

export interface VerifyDeps {
	/** Supabase client used for the revocation / lookup queries. Defaults to the service-role client. */
	supabase?: StoreClient;
	/** Trusted public keys (current first). Defaults to VC_ISSUER_JWK + VC_ISSUER_PREVIOUS_PUBLIC_JWKS. */
	getPublicJwks?: () => Promise<JWK[]>;
	/** Single-key convenience (legacy); ignored when getPublicJwks is given. */
	getPublicJwk?: () => Promise<JWK>;
	/** Client for the status-list bit check. Defaults to the service-role client. */
	statusDb?: StatusListDb;
	/** Expected issuer DID. Defaults to NEXT_PUBLIC_ISSUER_DID when set. */
	issuer?: string;
	now?: Date;
}

const MAX_JWS_LENGTH = 20_000;

function fail(reason: VerifyReason, extra: Partial<VerifyResult> = {}): VerifyResult {
	return { valid: false, reason, status: 'unknown', ...extra };
}

function mapJoseError(err: unknown): VerifyReason {
	if (err instanceof joseErrors.JWTExpired) return 'expired';
	if (err instanceof joseErrors.JWTClaimValidationFailed) {
		return err.claim === 'nbf' ? 'not_yet_valid' : 'invalid_claims';
	}
	if (err instanceof joseErrors.JOSEAlgNotAllowed) return 'alg_not_allowed';
	if (err instanceof joseErrors.JWKSNoMatchingKey) return 'unknown_key';
	if (err instanceof joseErrors.JWSSignatureVerificationFailed) return 'invalid_signature';
	if (err instanceof joseErrors.JWSInvalid || err instanceof joseErrors.JWTInvalid) return 'malformed_token';
	if (err instanceof joseErrors.JOSEError) return 'invalid_signature';
	return 'malformed_token';
}

async function getStore(deps: VerifyDeps): Promise<StoreClient> {
	if (deps.supabase) return deps.supabase;
	const { createSupabaseAdminClient } = await import('@/lib/supabaseServer');
	return createSupabaseAdminClient();
}

function expectedIssuer(deps: VerifyDeps): string | undefined {
	return deps.issuer ?? (process.env.NEXT_PUBLIC_ISSUER_DID || undefined);
}

function isoFromSeconds(v: unknown): string | undefined {
	return typeof v === 'number' && Number.isFinite(v) ? new Date(v * 1000).toISOString() : undefined;
}

interface StatusRow {
	id: string;
	status: string | null;
	revoked_at: string | null;
	revoked_reason: string | null;
	credential?: { proof?: { jws?: string } } | null;
}

async function lookupRow(
	store: StoreClient,
	id: string,
	withCredential: boolean
): Promise<{ row: StatusRow | null; failed: boolean }> {
	try {
		const base = withCredential ? 'id, status, credential' : 'id, status';
		let { data, error } = await store
			.from('verifiable_credentials')
			.select(`${base}, revoked_at, revoked_reason`)
			.eq('id', id)
			.maybeSingle();
		if (error && (error.code === '42703' || error.code === 'PGRST204')) {
			// revoked_at / revoked_reason columns do not exist: status alone is authoritative
			({ data, error } = await store.from('verifiable_credentials').select(base).eq('id', id).maybeSingle());
		}
		if (error) {
			console.error('[verifyCredential] credential lookup failed:', error.code ?? 'unknown');
			return { row: null, failed: true };
		}
		return { row: (data as unknown as StatusRow | null) ?? null, failed: false };
	} catch (e) {
		console.error('[verifyCredential] credential lookup threw:', e instanceof Error ? e.name : 'unknown');
		return { row: null, failed: true };
	}
}

export async function verifyCredential(input: VerifyInput, deps: VerifyDeps = {}): Promise<VerifyResult> {
	let jws = typeof input.jws === 'string' && input.jws ? input.jws : input.vc?.proof?.jws;
	const requestedId = typeof input.vcId === 'string' && input.vcId ? input.vcId : undefined;
	let store: StoreClient | null = null;

	try {
		// (a) obtain the JWS
		if (!jws) {
			if (!requestedId) return fail('missing_input');
			store = await getStore(deps);
			const { row, failed } = await lookupRow(store, requestedId, true);
			if (failed) return fail('revocation_check_failed');
			if (!row) return fail('unknown_credential');
			jws = row.credential?.proof?.jws;
			if (typeof jws !== 'string' || !jws) return fail('invalid_payload');
		}
		if (typeof jws !== 'string' || jws.length > MAX_JWS_LENGTH) return fail('malformed_token');

		// (b)+(c) signature, algorithm allow-list, exp/nbf
		let publicJwks: JWK[];
		try {
			publicJwks = deps.getPublicJwks
				? await deps.getPublicJwks()
				: deps.getPublicJwk
					? [await deps.getPublicJwk()]
					: await getIssuerPublicJwks();
		} catch (e) {
			console.error('[verifyCredential] issuer key unavailable:', e instanceof Error ? e.message : 'unknown');
			return fail('verifier_misconfigured');
		}

		let payload: JWTPayload;
		try {
			({ payload } = await verifyCredentialJwsWithKeys(jws, publicJwks, {
				issuer: expectedIssuer(deps),
				currentDate: deps.now,
			}));
		} catch (err) {
			return fail(mapJoseError(err));
		}

		// Bind to the signed credential, never to client-supplied fields
		const vc = payload.vc as Record<string, unknown> | undefined;
		const vcId = vc && typeof vc.id === 'string' ? vc.id : undefined;
		const subject = vc?.credentialSubject;
		if (!vc || typeof vc !== 'object' || !vcId || !subject || typeof subject !== 'object') {
			return fail('invalid_payload');
		}
		if (payload.jti !== undefined && payload.jti !== vcId) return fail('invalid_payload');
		if (requestedId && requestedId !== vcId) return fail('id_mismatch');

		const base: Partial<VerifyResult> = {
			payload,
			credentialId: vcId,
			issuer: typeof payload.iss === 'string' ? payload.iss : typeof vc.issuer === 'string' ? vc.issuer : undefined,
			issuedAt: isoFromSeconds(payload.iat),
			expiresAt: isoFromSeconds(payload.exp),
			credentialSubject: subject as Record<string, unknown>,
		};

		// (d) revocation by signed id; fail closed
		store = store ?? (await getStore(deps));
		const { row, failed } = await lookupRow(store, vcId, false);
		if (failed) return fail('revocation_check_failed', base);
		if (!row) return fail('unknown_credential', base);

		if (row.status === 'revoked' || row.revoked_at) {
			return {
				...fail('revoked', base),
				status: 'revoked',
				revokedAt: row.revoked_at ?? null,
				revokedReason: row.revoked_reason ?? null,
			};
		}
		if (row.status !== 'active') return fail('inactive', base);

		// (e) status-list bit (only when the SIGNED payload has a credentialStatus entry)
		const statusEntry = parseStatusEntry(vc);
		let statusList: VerifyResult['statusList'];
		if (statusEntry) {
			const bit = await checkStatusBit(statusEntry, deps.statusDb);
			if (bit.state === 'revoked') {
				return {
					...fail('revoked', base),
					status: 'revoked',
					revokedAt: row.revoked_at ?? null,
					revokedReason: row.revoked_reason ?? null,
				};
			}
			// Missing list / out-of-range index / lookup error: fail closed.
			if (bit.state === 'error') return fail('revocation_check_failed', base);
			// Storage not installed: the status column above already decided; record that the bit was not consulted.
			statusList = bit.state === 'unavailable' ? 'unavailable' : 'clear';
		}

		// (f) only signed-payload fields are returned
		return { valid: true, status: 'active', ...base, ...(statusList ? { statusList } : {}) };
	} catch (e) {
		console.error('[verifyCredential] unexpected error:', e instanceof Error ? e.name : 'unknown');
		return fail('revocation_check_failed');
	}
}

/** Public-facing view of a result: stable codes only, no internal payload internals beyond signed claims. */
export function toPublicResult(result: VerifyResult) {
	const { valid, reason, status, issuer, issuedAt, expiresAt, credentialId, credentialSubject, payload, revokedAt, revokedReason } = result;
	return {
		valid,
		revoked: status === 'revoked',
		status,
		...(reason ? { reason } : {}),
		...(credentialId ? { credentialId } : {}),
		...(issuer ? { issuer } : {}),
		...(issuedAt ? { issuedAt } : {}),
		...(expiresAt ? { expiresAt } : {}),
		...(credentialSubject ? { credentialSubject } : {}),
		...(payload ? { payload } : {}),
		...(revokedAt ? { revokedAt } : {}),
		...(revokedReason ? { revokedReason } : {}),
	};
}
