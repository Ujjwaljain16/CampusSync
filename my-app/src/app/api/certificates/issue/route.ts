import { NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { withAuth, success, apiError } from '@/lib/api';
import { signCredential } from '@/lib/vc';
interface CredentialSubject {
	id: string;
	certificateId: string;
	title: string;
	institution: string;
	dateIssued: string;
	description?: string;
}

interface IssueBody {
	credentialSubject?: CredentialSubject;
	certificateId?: string;
}

export const POST = withAuth(async (req: NextRequest, { user }) => {
	try {
		const supabase = await createSupabaseServerClient();
		
		// Get user role safely
		let role = 'student';
		try {
			const { data: roleData } = await supabase
				.from('user_roles')
				.select('role')
				.eq('user_id', user.id)
				.single();
			
			if (roleData) {
				role = roleData.role;
			}
		} catch (roleError) {
			console.error('Error fetching user role, defaulting to student:', roleError);
		}

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
			const isOwner = cert.student_id === user.id;
			const canIssueOnBehalf = role === 'admin' || role === 'faculty';
			if (!isOwner && !canIssueOnBehalf) {
				throw apiError.forbidden('Forbidden to issue for another user');
			}
		subject = {
			id: cert.student_id,
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
		student_id: subject.id, // Store with certificate owner's student_id, not issuer's
		issuer: vc.issuer,
		issuance_date: vc.issuanceDate,
		credential: vc,
		status: 'active',
		created_at: now,
	});
	if (error) {
		console.error('Database insert error:', error);
		throw apiError.internal(`Failed to store credential: ${error.message}`);
	}

		// Audit log: issue_vc
		try {
			await supabase.from('audit_logs').insert({
				actor_id: user.id,
				action: 'issue_vc',
				entity_type: 'verifiable_credential',
				entity_id: vc.id,
				details: { certificateId: body?.certificateId ?? subject.certificateId },
				created_at: now,
			});
		} catch (auditError) {
			// ignore audit failures
			console.error('Audit log error:', auditError);
		}

		return success(vc, 'Verifiable credential issued successfully', 201);
	} catch (error) {
		console.error('[Issue VC] Error:', error);
		// If it's already an API error, re-throw it
		if (error instanceof Response) {
			return error;
		}
		// Otherwise, return a generic error
		return apiError.internal(error instanceof Error ? error.message : 'Failed to issue verifiable credential');
	}
});






