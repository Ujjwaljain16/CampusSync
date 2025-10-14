import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient, getServerUserWithRole } from '@/lib/supabaseServer';
import { signCredential } from '../../../../../lib/vc';
import type { CredentialSubject } from '../../../../types';

export async function POST(req: NextRequest) {
	const supabase = await createSupabaseServerClient();

	const { user, role } = await getServerUserWithRole();
	if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

	const body = await req.json().catch(() => null) as { credentialSubject?: CredentialSubject; certificateId?: string } | null;
	if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });

	let subject: CredentialSubject | undefined = body.credentialSubject;

	// If called from auto-verify with certificateId, map it to credentialSubject
	if (!subject && body.certificateId) {
		const { data: cert, error: certErr } = await supabase
			.from('certificates')
			.select('*')
			.eq('id', body.certificateId)
			.single();
		if (certErr || !cert) {
			return NextResponse.json({ error: 'Certificate not found' }, { status: 404 });
		}
		// Only allow issuing for own certificate unless faculty/admin
		const isOwner = cert.user_id === user.id;
		const canIssueOnBehalf = role === 'admin' || role === 'faculty';
		if (!isOwner && !canIssueOnBehalf) {
			return NextResponse.json({ error: 'Forbidden to issue for another user' }, { status: 403 });
		}
		subject = {
			id: cert.user_id,
			certificateId: cert.id,
			title: cert.title,
			institution: cert.institution,
			dateIssued: cert.date_issued,
			description: cert.description ?? undefined,
		};
	} else if (subject) {
		const isSelfIssue = subject.id === user.id;
		const canIssueOnBehalf = role === 'admin' || role === 'faculty';
		if (!isSelfIssue && !canIssueOnBehalf) {
			return NextResponse.json({ error: 'Forbidden to issue for another user' }, { status: 403 });
		}
	}

	if (!subject) {
		return NextResponse.json({ error: 'Invalid credentialSubject or certificateId' }, { status: 400 });
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
	const now = new Date().toISOString();
	const { error } = await supabase.from('verifiable_credentials').insert({
		id: vc.id,
		user_id: subject.id, // Store with certificate owner's user_id, not issuer's
		issuer: vc.issuer,
		issuance_date: vc.issuanceDate,
		credential: vc,
		status: 'active',
		created_at: now,
	});
	if (error) return NextResponse.json({ error: error.message }, { status: 500 });

	// Audit log: issue_vc
	try {
		const { user: actor } = await getServerUserWithRole();
		await supabase.from('audit_logs').insert({
			user_id: actor?.id ?? null,
			action: 'issue_vc',
			entity_type: 'verifiable_credential',
			entity_id: vc.id,
			details: { certificateId: body?.certificateId ?? subject.certificateId },
			created_at: now,
		});
	} catch {
		// ignore audit failures
	}

	return NextResponse.json({ data: vc });
}



