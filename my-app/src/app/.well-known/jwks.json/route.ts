import { NextResponse } from 'next/server';
import { getIssuerPublicJwks } from '@/lib/vc';

// Public issuer key set so third parties can verify credentials offline.
// Contains the CURRENT key first, then any previous (rotated-out) public keys from
// VC_ISSUER_PREVIOUS_PUBLIC_JWKS. Only public members are ever emitted (see toPublicJwk).
export const dynamic = 'force-dynamic';

export async function GET() {
	try {
		const jwks = await getIssuerPublicJwks();
		return NextResponse.json(
			{ keys: jwks.map(jwk => ({ ...jwk, use: 'sig' })) },
			{
				headers: {
					'Cache-Control': 'public, max-age=300',
					// Public data: lets browser-based verifiers on other origins fetch it.
					'Access-Control-Allow-Origin': '*',
				},
			}
		);
	} catch (e) {
		console.error('[jwks] issuer key unavailable:', e instanceof Error ? e.message : 'unknown');
		return NextResponse.json(
			{ error: 'Issuer key unavailable' },
			{ status: 503, headers: { 'Cache-Control': 'no-store' } }
		);
	}
}
