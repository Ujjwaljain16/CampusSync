import { NextRequest } from 'next/server';
import { createSupabaseServerClient, getServerUserWithRole } from '@/lib/supabaseServer';
import { withAuth, success, apiError } from '@/lib/api';
import { signCredential } from '../../../../../lib/vc';
interface CredentialSubject {
	id: string;
	certificateId?: string;
	title?: string;
	institution?: string;
	dateIssued?: string;
	description?: string;
}

interface IssueBody {
	credentialSubject?: CredentialSubject;
	certificateId?: string;
}

export const POST = withAuth(async (req: NextRequest, { user }) => {
	const supabase = await createSupabaseServerClient();
	const { role } = await getServerUserWithRole();

	const body = await req.json().catch(() => null) as IssueBody | null;
	if (!body) throw apiError.badRequest('Invalid JSON');

	let subject: CredentialSubject | undefined = body.credentialSubject;

	// If called from auto-verify with certificateId, map it to credentialSubject
	if (!subject && body.certificateId) {
		const { data: cert, error: certErr } = await supabase
			.from('certificates')
			.select('*')
			.eq('id', body.certificateId)
			.single();
		if (certErr || !cert) {
			throw apiError.notFound('Certificate not found');
		}
		// Only allow issuing for own certificate unless faculty/admin
		const isOwner = cert.user_id === user.id;
		const canIssueOnBehalf = role === 'admin' || role === 'faculty';
		if (!isOwner && !canIssueOnBehalf) {
			throw apiError.forbidden('Forbidden to issue for another user');
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
			throw apiError.forbidden('Forbidden to issue for another user');
		}
	}

	if (!subject) {
		throw apiError.badRequest('Invalid credentialSubject or certificateId');
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
	if (error) throw apiError.internal(error.message);

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

	return success(vc, 'Verifiable credential issued successfully', 201);
});



