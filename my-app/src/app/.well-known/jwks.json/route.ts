import { NextResponse } from 'next/server';
import { getIssuerPublicJwk } from '@/lib/vc';

// Public issuer key set so third parties can verify credentials offline.
// Only public members are ever emitted (see toPublicJwk).
export const dynamic = 'force-dynamic';

export async function GET() {
	try {
		const jwk = await getIssuerPublicJwk();
		return NextResponse.json(
			{ keys: [{ ...jwk, use: 'sig' }] },
			{ headers: { 'Cache-Control': 'public, max-age=300' } }
		);
	} catch (e) {
		console.error('[jwks] issuer key unavailable:', e instanceof Error ? e.message : 'unknown');
		return NextResponse.json(
			{ error: 'Issuer key unavailable' },
			{ status: 503, headers: { 'Cache-Control': 'no-store' } }
		);
	}
}
