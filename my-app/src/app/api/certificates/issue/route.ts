import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient, getServerUserWithRole } from '../../../../../lib/supabaseServer';
import { signCredential } from '../../../../../lib/vc';
import type { CredentialSubject } from '../../../../types';

export async function POST(req: NextRequest) {
	const supabase = await createSupabaseServerClient();
	const { user, role } = await getServerUserWithRole();
	if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

	const body = await req.json().catch(() => null);
	if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });

	const subject: CredentialSubject | undefined = body.credentialSubject;
	if (!subject) {
		return NextResponse.json({ error: 'Invalid credentialSubject' }, { status: 400 });
	}
	const isSelfIssue = subject.id === user.id;
	const canIssueOnBehalf = role === 'faculty' || role === 'admin';
	if (!isSelfIssue && !canIssueOnBehalf) {
		return NextResponse.json({ error: 'Forbidden to issue for another user' }, { status: 403 });
	}

	const issuerDid = process.env.NEXT_PUBLIC_ISSUER_DID || 'did:web:example.org';
	const verificationMethod = process.env.NEXT_PUBLIC_ISSUER_VERIFICATION_METHOD || `${issuerDid}#keys-1`;

	const vc = await signCredential({
		issuerDid,
		verificationMethod,
		credential: {
			credentialSubject: subject,
		},
	});

	// Store VC in Supabase table `verifiable_credentials`
	const { error } = await supabase.from('verifiable_credentials').insert({
		id: vc.id,
		user_id: user.id,
		issuer: vc.issuer,
		issuance_date: vc.issuanceDate,
		credential: vc,
		created_at: new Date().toISOString(),
	});
	if (error) return NextResponse.json({ error: error.message }, { status: 500 });

	return NextResponse.json({ data: vc });
}


