import { NextResponse } from 'next/server';
import { getIssuerPublicJwks } from '@/lib/vc';

// did:web document for NEXT_PUBLIC_ISSUER_DID. Served at /.well-known/did.json, which is the
// location did:web resolves HOST-ONLY DIDs to (did:web:example.com -> https://example.com/.well-known/did.json).
// Contains the current key and any previous public keys so old credentials stay verifiable.
export const dynamic = 'force-dynamic';

const PLACEHOLDER_DID = /your-domain\.example|replace-me|example\.invalid/i;

const noStore = { 'Cache-Control': 'no-store' };

function requestHost(req: Request): string | null {
	const forwarded = req.headers.get('x-forwarded-host')?.split(',')[0]?.trim();
	if (forwarded) return forwarded.toLowerCase();
	const host = req.headers.get('host')?.trim();
	// No usable host header: no host check is possible, the document is served anyway.
	// (The URL's own host is deliberately not used: behind some proxies it is an internal name.)
	return host ? host.toLowerCase() : null;
}

export async function GET(req: Request) {
	const did = process.env.NEXT_PUBLIC_ISSUER_DID?.trim();
	if (!did || PLACEHOLDER_DID.test(did)) {
		return NextResponse.json({ error: 'Issuer DID is not configured' }, { status: 503, headers: noStore });
	}

	const m = /^did:web:([^:]+)(:.+)?$/.exec(did);
	if (!m) {
		return NextResponse.json({ error: 'Issuer DID is not a did:web identifier' }, { status: 404, headers: noStore });
	}
	if (m[2]) {
		// did:web:host:path:segments resolves to https://host/path/segments/did.json, not /.well-known/did.json
		return NextResponse.json(
			{ error: 'Issuer DID has path segments; publish its document at the path the DID resolves to' },
			{ status: 404, headers: noStore }
		);
	}

	let didHost: string;
	try {
		didHost = decodeURIComponent(m[1]).toLowerCase(); // %3A -> ":" for ports
	} catch {
		return NextResponse.json({ error: 'Issuer DID is malformed' }, { status: 503, headers: noStore });
	}
	const host = requestHost(req);
	if (host && host !== didHost) {
		return NextResponse.json({ error: 'This host is not the issuer DID host' }, { status: 404, headers: noStore });
	}

	let keys;
	try {
		keys = await getIssuerPublicJwks();
	} catch (e) {
		console.error('[did.json] issuer key unavailable:', e instanceof Error ? e.message : 'unknown');
		return NextResponse.json({ error: 'Issuer key unavailable' }, { status: 503, headers: noStore });
	}

	const verificationMethod = keys.map(jwk => ({
		id: `${did}#${jwk.kid}`,
		type: 'JsonWebKey2020',
		controller: did,
		publicKeyJwk: { ...jwk, use: 'sig' },
	}));

	return NextResponse.json(
		{
			'@context': ['https://www.w3.org/ns/did/v1', 'https://w3id.org/security/suites/jws-2020/v1'],
			id: did,
			verificationMethod,
			assertionMethod: verificationMethod.map(v => v.id),
		},
		{
			headers: {
				'Cache-Control': 'public, max-age=300',
				'Access-Control-Allow-Origin': '*',
			},
		}
	);
}
