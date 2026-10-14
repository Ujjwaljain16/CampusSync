import { NextResponse } from 'next/server';
import { enforceRateLimit } from '@/lib/rateLimit';
import { getIssuerDID } from '@/lib/envValidator';
import {
	STATUS_LIST_ID_PATTERN,
	StatusListUnavailableError,
	buildStatusListCredential,
	isStatusListEnabled,
	loadStatusList,
	statusListUrl,
	type SignedStatusList,
} from '@/lib/statusList';

// Public by design: third parties fetch the signed revocation bitstring to check credentials
// offline. The body is a JWS signed by the issuer key; nothing in it identifies a student
// (only bits at opaque indexes). Disabled (404) unless VC_STATUS_LIST_ENABLED=true.
export const dynamic = 'force-dynamic';

const PUBLIC_HEADERS = {
	'Cache-Control': 'public, max-age=60',
	'Access-Control-Allow-Origin': '*',
};
const SIGN_CACHE_MS = 60_000;
const signCache = new Map<string, { at: number; value: SignedStatusList }>();

export async function GET(req: Request, context: { params: Promise<{ listId: string }> }) {
	if (!isStatusListEnabled()) {
		return NextResponse.json({ error: 'Status lists are not enabled' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
	}
	const limited = enforceRateLimit(req, 'status-list', { interval: 60_000, uniqueTokenPerInterval: 120 });
	if (limited) return limited;

	const { listId } = await context.params;
	if (!STATUS_LIST_ID_PATTERN.test(listId)) {
		return NextResponse.json({ error: 'Not found' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
	}

	try {
		const list = await loadStatusList(listId);
		if (!list) return NextResponse.json({ error: 'Not found' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });

		// Signing is cheap for Ed25519 but not free for RSA: reuse a recent signature while the list is unchanged.
		const cacheKey = `${listId}|${list.updatedAt}`;
		const hit = signCache.get(cacheKey);
		if (hit && Date.now() - hit.at < SIGN_CACHE_MS) {
			return NextResponse.json(hit.value, { headers: PUBLIC_HEADERS });
		}

		const signed = await buildStatusListCredential({
			id: statusListUrl(listId),
			purpose: 'revocation',
			bits: list.bytes,
			issuerDid: getIssuerDID(),
			updatedAt: list.updatedAt,
		});
		signCache.set(cacheKey, { at: Date.now(), value: signed });
		if (signCache.size > 100) signCache.delete(signCache.keys().next().value as string);
		return NextResponse.json(signed, { headers: PUBLIC_HEADERS });
	} catch (e) {
		if (e instanceof StatusListUnavailableError) {
			return NextResponse.json({ error: 'Status lists are not available' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
		}
		console.error('[status list] failed:', e instanceof Error ? e.message : 'unknown');
		return NextResponse.json({ error: 'Status list unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
	}
}
