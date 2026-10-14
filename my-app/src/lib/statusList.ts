/**
 * Revocation status lists (a bitstring status list inspired by the W3C
 * "Bitstring Status List" draft; see docs/VERIFIABLE-CREDENTIALS.md for exactly what is
 * and is not compatible).
 *
 * SERVER ONLY: uses Node `zlib` and the service-role database client. Browser/CLI
 * verifiers have their own decoder in verifier/src/verify.mjs (DecompressionStream).
 *
 * Model
 *  - A list is a fixed-size bitstring (default 131072 bits = 16 KiB). Index i is bit
 *    (7 - i % 8) of byte floor(i / 8): index 0 is the MOST significant bit of byte 0
 *    (the bit order used by the W3C draft).
 *  - A credential is assigned one index at issuance. Bit = 1 means revoked.
 *  - `encodedList` = "u" + base64url(no padding) of the GZIP-compressed bytes
 *    (multibase base64url prefix "u", as in the draft).
 *  - The database holds the raw bytes (base64) in `vc_status_lists.bits`; the public route
 *    signs the list on the fly with the issuer key.
 *
 * Everything is behind VC_STATUS_LIST_ENABLED=true and degrades gracefully when the
 * migration has not been applied (see isStatusListUnavailable).
 */
import { gzipSync, gunzipSync } from 'node:zlib';
import type { SupabaseClient } from '@supabase/supabase-js';
import { signVcPayload, type CredentialStatusEntry } from '@/lib/vc';

export const DEFAULT_LIST_SIZE = 131_072; // bits (16 KiB)
export const MAX_DECODED_BYTES = 8 * 1024 * 1024;
export const STATUS_LIST_TABLE = 'vc_status_lists';
export const STATUS_LIST_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,39}$/;
/** How many lists allocation will walk through before giving up. */
const MAX_LISTS = 50;

export type StatusPurpose = 'revocation';

export type StatusListDb = Pick<SupabaseClient, 'from' | 'rpc'>;

// ---------------------------------------------------------------------------
// Feature flag + URLs
// ---------------------------------------------------------------------------

export function isStatusListEnabled(): boolean {
	return process.env.VC_STATUS_LIST_ENABLED === 'true';
}

function trimSlash(s: string): string {
	return s.replace(/\/+$/, '');
}

/** did:web:host(%3Aport) -> https://host(:port) (http for localhost). Host-only DIDs only. */
function originFromDidWeb(did: string | undefined): string | null {
	const m = /^did:web:([^:]+)$/.exec(did ?? '');
	if (!m) return null;
	const host = decodeURIComponent(m[1]);
	const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host);
	return `${local ? 'http' : 'https'}://${host}`;
}

/** Public origin of this deployment (used to build status-list URLs). */
export function getPublicBaseUrl(): string | null {
	const env = process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_SITE_URL;
	if (env) return trimSlash(env);
	return originFromDidWeb(process.env.NEXT_PUBLIC_ISSUER_DID);
}

export function statusListUrl(listId: string): string {
	const base = getPublicBaseUrl();
	if (!base) throw new Error('Cannot build a status list URL: set NEXT_PUBLIC_BASE_URL or a did:web NEXT_PUBLIC_ISSUER_DID');
	return `${base}/api/status/revocation/${listId}`;
}

// ---------------------------------------------------------------------------
// Bitstring operations
// ---------------------------------------------------------------------------

export function createBitstring(sizeBits: number = DEFAULT_LIST_SIZE): Uint8Array {
	if (!Number.isInteger(sizeBits) || sizeBits <= 0 || sizeBits % 8 !== 0) {
		throw new Error('Status list size must be a positive multiple of 8 bits');
	}
	return new Uint8Array(sizeBits / 8);
}

function assertIndex(bytes: Uint8Array, index: number): void {
	if (!Number.isInteger(index) || index < 0 || index >= bytes.length * 8) {
		throw new RangeError(`Status list index ${index} out of range`);
	}
}

export function getBit(bytes: Uint8Array, index: number): boolean {
	assertIndex(bytes, index);
	return ((bytes[index >> 3] >> (7 - (index & 7))) & 1) === 1;
}

/** Set (default) or clear a bit in place. */
export function setBit(bytes: Uint8Array, index: number, value = true): void {
	assertIndex(bytes, index);
	const mask = 1 << (7 - (index & 7));
	if (value) bytes[index >> 3] |= mask;
	else bytes[index >> 3] &= ~mask;
}

export function bytesToBase64(bytes: Uint8Array): string {
	return Buffer.from(bytes).toString('base64');
}

export function base64ToBytes(b64: string): Uint8Array {
	return new Uint8Array(Buffer.from(b64, 'base64'));
}

/** "u" + base64url(gzip(bytes)). */
export function encodeList(bytes: Uint8Array): string {
	return 'u' + Buffer.from(gzipSync(bytes)).toString('base64url');
}

export function decodeList(encoded: string): Uint8Array {
	if (typeof encoded !== 'string' || !encoded.startsWith('u')) {
		throw new Error('encodedList must be multibase base64url (prefix "u")');
	}
	const gz = Buffer.from(encoded.slice(1), 'base64url');
	return new Uint8Array(gunzipSync(gz, { maxOutputLength: MAX_DECODED_BYTES }));
}

// ---------------------------------------------------------------------------
// Database access
// ---------------------------------------------------------------------------

/** Postgres undefined_table / undefined_column / undefined_function and their PostgREST equivalents. */
const UNAVAILABLE_CODES = new Set(['42P01', '42703', '42883', 'PGRST202', 'PGRST204', 'PGRST205']);

export function isStatusListUnavailable(error: { code?: string } | null | undefined): boolean {
	return !!error?.code && UNAVAILABLE_CODES.has(error.code);
}

/** Thrown when the status-list tables/functions are not installed (migration not applied). */
export class StatusListUnavailableError extends Error {
	constructor() {
		super('Status list storage is not available (migration not applied?)');
		this.name = 'StatusListUnavailableError';
	}
}

async function defaultDb(): Promise<StatusListDb> {
	const { createSupabaseAdminClient } = await import('@/lib/supabaseServer');
	return (await createSupabaseAdminClient()) as unknown as StatusListDb;
}

export interface StoredStatusList {
	id: string;
	purpose: StatusPurpose;
	bytes: Uint8Array;
	size: number;
	nextIndex: number;
	updatedAt: string;
}

/** Load a list; null when it does not exist. Throws StatusListUnavailableError / Error on DB problems. */
export async function loadStatusList(listId: string, db?: StatusListDb): Promise<StoredStatusList | null> {
	if (!STATUS_LIST_ID_PATTERN.test(listId)) return null;
	const client = db ?? (await defaultDb());
	const { data, error } = await client
		.from(STATUS_LIST_TABLE)
		.select('id, purpose, bits, next_index, size, updated_at')
		.eq('id', listId)
		.maybeSingle();
	if (error) {
		if (isStatusListUnavailable(error)) throw new StatusListUnavailableError();
		throw new Error(`status list lookup failed (${error.code ?? 'unknown'})`);
	}
	if (!data) return null;
	const row = data as { id: string; purpose: string; bits: string; next_index: number; size: number; updated_at: string };
	return {
		id: row.id,
		purpose: row.purpose as StatusPurpose,
		bytes: base64ToBytes(row.bits),
		size: row.size,
		nextIndex: row.next_index,
		updatedAt: row.updated_at,
	};
}

export interface AllocatedStatus {
	listId: string;
	index: number;
	listUrl: string;
	entry: CredentialStatusEntry;
}

export function buildStatusEntry(listUrl: string, index: number): CredentialStatusEntry {
	return {
		id: `${listUrl}#${index}`,
		type: 'BitstringStatusListEntry',
		statusPurpose: 'revocation',
		statusListIndex: String(index),
		statusListCredential: listUrl,
	};
}

let listCursor = 1; // process-local hint: first list that may still have free slots

/** Test helper. */
export function __resetStatusListCursor(): void {
	listCursor = 1;
}

/**
 * Atomically allocate the next free index (Postgres function allocate_status_index, which
 * also creates the list on first use). Walks to the next list when one is full.
 * Returns null when the feature is disabled or the storage is unavailable / exhausted;
 * NEVER throws, so issuance keeps working without a status entry.
 */
export async function allocateStatusEntry(db?: StatusListDb): Promise<AllocatedStatus | null> {
	if (!isStatusListEnabled()) return null;
	try {
		const client = db ?? (await defaultDb());
		for (let n = listCursor; n <= MAX_LISTS; n++) {
			const listId = `rev-${n}`;
			const { data, error } = await client.rpc('allocate_status_index', { list_id: listId });
			if (error) {
				if (isStatusListUnavailable(error)) {
					console.warn('[statusList] allocation unavailable (migration not applied?); issuing without credentialStatus');
				} else {
					console.error('[statusList] allocation failed:', error.code ?? 'unknown');
				}
				return null;
			}
			if (typeof data === 'number' && Number.isInteger(data) && data >= 0) {
				listCursor = n;
				const listUrl = statusListUrl(listId);
				return { listId, index: data, listUrl, entry: buildStatusEntry(listUrl, data) };
			}
			// null => this list is full, try the next one
		}
		console.error('[statusList] all status lists are full');
		return null;
	} catch (e) {
		console.error('[statusList] allocation threw:', e instanceof Error ? e.message : 'unknown');
		return null;
	}
}

/** Informational copy of the entry on the credential row (columns added by the draft migration). Best effort. */
export async function recordStatusColumns(vcId: string, status: AllocatedStatus, db?: Pick<SupabaseClient, 'from'>): Promise<void> {
	try {
		const client = db ?? (await defaultDb());
		const { error } = await client
			.from('verifiable_credentials')
			.update({ status_list_id: status.listId, status_list_index: status.index })
			.eq('id', vcId);
		if (error && !isStatusListUnavailable(error)) console.warn('[statusList] could not record status columns:', error.code);
	} catch {
		// informational only
	}
}

// ---------------------------------------------------------------------------
// Reading a credential's status entry
// ---------------------------------------------------------------------------

export interface ParsedStatusEntry {
	listId: string;
	index: number;
	listUrl: string;
}

const LIST_PATH = /\/api\/status\/revocation\/([a-z0-9][a-z0-9-]{0,39})$/;

/** Extract this issuer's revocation status entry from a credential object (stored VC or signed payload `vc`). */
export function parseStatusEntry(credential: unknown): ParsedStatusEntry | null {
	if (!credential || typeof credential !== 'object') return null;
	const raw = (credential as { credentialStatus?: unknown }).credentialStatus;
	const candidates = Array.isArray(raw) ? raw : raw ? [raw] : [];
	for (const c of candidates) {
		if (!c || typeof c !== 'object') continue;
		const e = c as Record<string, unknown>;
		if (e.type !== 'BitstringStatusListEntry' || e.statusPurpose !== 'revocation') continue;
		if (typeof e.statusListCredential !== 'string' || typeof e.statusListIndex !== 'string') continue;
		if (!/^\d{1,9}$/.test(e.statusListIndex)) continue;
		let pathname: string;
		try {
			pathname = new URL(e.statusListCredential).pathname;
		} catch {
			continue;
		}
		const m = LIST_PATH.exec(pathname);
		if (!m) continue;
		return { listId: m[1], index: Number(e.statusListIndex), listUrl: e.statusListCredential };
	}
	return null;
}

export type BitCheck = { state: 'clear' | 'revoked' | 'unavailable' | 'error' };

/** Read one bit from the database-held list. Never throws. */
export async function checkStatusBit(entry: ParsedStatusEntry, db?: StatusListDb): Promise<BitCheck> {
	try {
		const list = await loadStatusList(entry.listId, db);
		if (!list || entry.index >= list.size || entry.index >= list.bytes.length * 8) return { state: 'error' };
		return { state: getBit(list.bytes, entry.index) ? 'revoked' : 'clear' };
	} catch (e) {
		if (e instanceof StatusListUnavailableError) return { state: 'unavailable' };
		console.error('[statusList] bit check failed:', e instanceof Error ? e.message : 'unknown');
		return { state: 'error' };
	}
}

/** Set the revocation bit (atomic SQL function set_status_bit). Never throws. */
export async function setRevocationBit(entry: ParsedStatusEntry, db?: StatusListDb): Promise<boolean> {
	try {
		const client = db ?? (await defaultDb());
		const { data, error } = await client.rpc('set_status_bit', { list_id: entry.listId, bit_index: entry.index });
		if (error) {
			if (isStatusListUnavailable(error)) console.warn('[statusList] set bit unavailable (migration not applied?)');
			else console.error('[statusList] set bit failed:', error.code ?? 'unknown');
			return false;
		}
		if (data !== true) {
			console.warn('[statusList] set bit matched no allocated slot', entry.listId, entry.index);
			return false;
		}
		return true;
	} catch (e) {
		console.error('[statusList] set bit threw:', e instanceof Error ? e.message : 'unknown');
		return false;
	}
}

/**
 * Best-effort: flip the status-list bit of every revoked credential that carries a
 * credentialStatus entry. Credentials without one are skipped without touching the database.
 * Never throws and never affects the revocation itself (verifiable_credentials.status stays
 * authoritative).
 */
export async function markCredentialsRevoked(
	rows: Array<{ id?: string; credential?: unknown }>,
	db?: StatusListDb
): Promise<number> {
	let flipped = 0;
	try {
		const entries = rows.map(r => parseStatusEntry(r.credential)).filter((e): e is ParsedStatusEntry => e !== null);
		if (entries.length === 0) return 0;
		const client = db ?? (await defaultDb());
		for (const entry of entries) {
			if (await setRevocationBit(entry, client)) flipped++;
		}
	} catch (e) {
		console.error('[statusList] marking revoked credentials failed:', e instanceof Error ? e.message : 'unknown');
	}
	return flipped;
}

// ---------------------------------------------------------------------------
// Signed status list credential
// ---------------------------------------------------------------------------

export interface SignedStatusList {
	jws: string;
	id: string;
	updatedAt: string;
}

export interface BuildStatusListParams {
	/** Public URL of the list (becomes the credential id; subject id is `${id}#list`). */
	id: string;
	purpose: StatusPurpose;
	bits: Uint8Array;
	issuerDid: string;
	updatedAt?: string;
}

export async function buildStatusListCredential(params: BuildStatusListParams): Promise<SignedStatusList> {
	const now = new Date().toISOString();
	const vc = {
		'@context': ['https://www.w3.org/2018/credentials/v1'],
		id: params.id,
		type: ['VerifiableCredential', 'BitstringStatusListCredential'],
		issuer: params.issuerDid,
		issuanceDate: now,
		credentialSubject: {
			id: `${params.id}#list`,
			type: 'BitstringStatusList',
			statusPurpose: params.purpose,
			encodedList: encodeList(params.bits),
		},
	};
	const { jws } = await signVcPayload(vc, { issuerDid: params.issuerDid, subject: params.id });
	return { jws, id: params.id, updatedAt: params.updatedAt ?? now };
}
