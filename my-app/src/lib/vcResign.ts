/**
 * Credential re-signing for issuer key rotation.
 *
 * After the issuer signing key is replaced, every ACTIVE stored credential that was signed
 * by a different key is re-signed with the CURRENT key, so the previous public key can be
 * removed from VC_ISSUER_PREVIOUS_PUBLIC_JWKS (see docs/KEY-ROTATION.md).
 *
 * The credential payload is rebuilt unchanged (same id, subject, issuance / expiration dates,
 * status entry); only the proof is replaced. Signing goes through signVcPayload in vc.ts, so
 * this file contains no crypto of its own. Rows are written back with the service-role client
 * passed in by the caller; `status`, `certificate_id` and `organization_id` are never touched.
 * Revoked rows are not selected at all.
 */
import { decodeJwt, decodeProtectedHeader } from 'jose';
import {
	getIssuerJwk,
	getIssuerKeyId,
	getIssuerPublicJwk,
	isPlaceholderJwk,
	signVcPayload,
	verifyCredentialJws,
	type PublicIssuerJwk,
} from '@/lib/vc';

/** Minimal client surface: the service-role Supabase client (or a test fake). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ResignDb = { from: (table: string) => any };

export interface ResignSigner {
	/** kid of the key that signs (the CURRENT issuer key). */
	kid: string;
	/** Signs a VC-shaped payload; same contract as signVcPayload. */
	sign: (
		vc: Record<string, unknown>,
		opts: { issuerDid: string; jti?: string; subject?: string; expiresInSec?: number }
	) => Promise<{ jws: string; kid: string }>;
	/** When set, every new signature is verified against it before it is stored. */
	publicJwk?: PublicIssuerJwk;
}

export interface ResignRow {
	id: string;
	status?: string | null;
	credential: unknown;
}

export type ResignOutcome =
	| { outcome: 'resigned'; credential: Record<string, unknown>; fromKid: string | null }
	| { outcome: 'skipped'; reason: 'already_current' | 'expired' }
	| { outcome: 'failed'; reason: string };

export interface ResignSummary {
	scanned: number;
	resigned: number;
	skipped: number;
	failed: Array<{ id: string; reason: string }>;
	dryRun: boolean;
	/** True when the run stopped because `limit` re-signed credentials were reached; run again. */
	limitReached: boolean;
}

/** The signer for the CURRENT issuer key (VC_ISSUER_JWK). Throws when it is missing, a placeholder or unusable. */
export async function getCurrentSigner(): Promise<ResignSigner> {
	const jwk = await getIssuerJwk();
	if (isPlaceholderJwk(jwk)) throw new Error('Issuer key is a development placeholder');
	const kid = await getIssuerKeyId(jwk);
	if (!kid) throw new Error('Issuer key has no kid');
	const publicJwk = await getIssuerPublicJwk();
	return { kid, sign: signVcPayload, publicJwk };
}

function isRecord(v: unknown): v is Record<string, unknown> {
	return !!v && typeof v === 'object' && !Array.isArray(v);
}

/**
 * Re-sign one stored credential. Pure with respect to the database: returns the new credential
 * object (or why it was skipped / failed) and writes nothing.
 */
export async function resignCredential(
	row: ResignRow,
	opts: { signer: ResignSigner; now?: Date }
): Promise<ResignOutcome> {
	const { signer } = opts;
	const nowSec = Math.floor((opts.now ?? new Date()).getTime() / 1000);

	const stored = row.credential;
	if (!isRecord(stored)) return { outcome: 'failed', reason: 'invalid_credential' };
	const proof = stored.proof;
	const oldJws = isRecord(proof) ? proof.jws : undefined;
	if (typeof oldJws !== 'string' || !oldJws) return { outcome: 'failed', reason: 'missing_proof' };

	let oldKid: string | undefined;
	let oldExp: number | undefined;
	try {
		oldKid = decodeProtectedHeader(oldJws).kid;
		const exp = decodeJwt(oldJws).exp;
		oldExp = typeof exp === 'number' ? exp : undefined;
	} catch {
		return { outcome: 'failed', reason: 'malformed_proof' };
	}
	// Credentials without a kid (legacy) are not known to be signed by the current key: re-sign them.
	if (oldKid === signer.kid) return { outcome: 'skipped', reason: 'already_current' };

	if (typeof stored.id !== 'string' || stored.id !== row.id) return { outcome: 'failed', reason: 'id_mismatch' };
	if (typeof stored.issuer !== 'string' || !stored.issuer) return { outcome: 'failed', reason: 'invalid_issuer' };
	if (!isRecord(stored.credentialSubject)) return { outcome: 'failed', reason: 'invalid_subject' };

	// Same expiry as before: the credential's expirationDate, else the old token's exp, else none.
	let expSec: number | undefined = oldExp;
	if (typeof stored.expirationDate === 'string') {
		const ms = Date.parse(stored.expirationDate);
		if (Number.isNaN(ms)) return { outcome: 'failed', reason: 'invalid_expiration' };
		expSec = Math.floor(ms / 1000);
	}
	if (expSec !== undefined && expSec <= nowSec) return { outcome: 'skipped', reason: 'expired' };

	// Everything except the proof is the signed payload, exactly as signCredential built it.
	const { proof: _oldProof, ...unsigned } = stored;
	void _oldProof;
	const subjectId = stored.credentialSubject.id;
	try {
		const { jws, kid } = await signer.sign(unsigned, {
			issuerDid: stored.issuer,
			jti: stored.id,
			subject: typeof subjectId === 'string' && subjectId ? subjectId : undefined,
			expiresInSec: expSec === undefined ? undefined : expSec - nowSec,
		});
		if (kid !== signer.kid) return { outcome: 'failed', reason: 'signer_kid_mismatch' };
		if (signer.publicJwk) {
			// Never store a signature that does not verify with the key we are about to trust.
			const verified = await verifyCredentialJws(jws, signer.publicJwk, { issuer: stored.issuer });
			const vc = verified.payload.vc as { id?: unknown } | undefined;
			if (!vc || vc.id !== stored.id || verified.payload.jti !== stored.id) {
				return { outcome: 'failed', reason: 'verification_failed' };
			}
		}

		const oldProof = isRecord(proof) ? proof : {};
		const oldMethod = typeof oldProof.verificationMethod === 'string' ? oldProof.verificationMethod : undefined;
		// A method that points at the old key id moves to the new one; a custom method is kept.
		const verificationMethod =
			!oldMethod || (oldKid && oldMethod.endsWith(`#${oldKid}`)) || !oldKid
				? `${stored.issuer}#${kid}`
				: oldMethod;

		const credential: Record<string, unknown> = {
			...unsigned,
			proof: {
				type: typeof oldProof.type === 'string' ? oldProof.type : 'JsonWebSignature2020',
				created: typeof oldProof.created === 'string' ? oldProof.created : String(stored.issuanceDate ?? new Date().toISOString()),
				proofPurpose: 'assertionMethod',
				verificationMethod,
				jws,
			},
		};
		return { outcome: 'resigned', credential, fromKid: oldKid ?? null };
	} catch {
		// Raw error text is not returned (it can contain key-handling detail).
		return { outcome: 'failed', reason: 'signing_failed' };
	}
}

const PAGE_SIZE = 200;

/**
 * Re-sign every ACTIVE credential whose proof was not made by the current key.
 *
 * - `dryRun`: signs and verifies in memory (so problems show up) but writes nothing.
 * - `limit`: stop after this many credentials were re-signed (run again to continue).
 * - One failing row is recorded in `failed` and never stops the others.
 * - Idempotent: rows already signed by the current key are skipped.
 * `db` MUST be the service-role client.
 */
export async function resignAll(
	db: ResignDb,
	opts: { dryRun?: boolean; limit?: number; signer?: ResignSigner; now?: Date } = {}
): Promise<ResignSummary> {
	const dryRun = opts.dryRun === true;
	const limit = typeof opts.limit === 'number' && opts.limit > 0 ? Math.floor(opts.limit) : Infinity;
	const signer = opts.signer ?? (await getCurrentSigner());

	const summary: ResignSummary = { scanned: 0, resigned: 0, skipped: 0, failed: [], dryRun, limitReached: false };

	for (let from = 0; ; from += PAGE_SIZE) {
		const { data, error } = await db
			.from('verifiable_credentials')
			.select('id, status, credential')
			.eq('status', 'active')
			.order('id', { ascending: true })
			.range(from, from + PAGE_SIZE - 1);
		if (error) {
			const code = (error as { code?: string }).code;
			summary.failed.push({ id: '*', reason: `read_failed${code ? `:${code}` : ''}` });
			break;
		}
		const rows = (data ?? []) as ResignRow[];

		for (const row of rows) {
			if (summary.resigned >= limit) {
				summary.limitReached = true;
				return summary;
			}
			summary.scanned++;
			const result = await resignCredential(row, { signer, now: opts.now });
			if (result.outcome === 'skipped') {
				summary.skipped++;
			} else if (result.outcome === 'failed') {
				summary.failed.push({ id: row.id, reason: result.reason });
			} else if (dryRun) {
				summary.resigned++;
			} else {
				// Guarded by status='active': a credential revoked in the meantime is not touched.
				const { data: updated, error: updErr } = await db
					.from('verifiable_credentials')
					.update({ credential: result.credential })
					.eq('id', row.id)
					.eq('status', 'active')
					.select('id');
				if (updErr) {
					summary.failed.push({ id: row.id, reason: 'write_failed' });
				} else if (!updated || updated.length === 0) {
					summary.skipped++;
				} else {
					summary.resigned++;
				}
			}
		}
		if (rows.length < PAGE_SIZE) break;
	}
	return summary;
}
