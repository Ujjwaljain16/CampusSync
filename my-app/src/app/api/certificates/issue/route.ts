import { NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { withAuth, success, apiError, isValidUUID, getOrganizationContext, getTargetOrganizationIds } from '@/lib/api';
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

		// SECURITY: the credential subject is ALWAYS built from the stored, verified
		// certificate record. Client-supplied subject fields are ignored so nobody
		// can obtain an issuer-signed credential for arbitrary claims.
		const certificateId = body.certificateId ?? body.credentialSubject?.certificateId;
		if (!certificateId || !isValidUUID(certificateId)) {
			throw apiError.badRequest('A valid certificateId is required');
		}

		const { data: cert, error: certErr } = await supabase
			.from('certificates')
			.select('*')
			.eq('id', certificateId)
			.single();
		if (certErr || !cert) {
			throw apiError.notFound('Certificate not found');
		}

		// Only verified certificates can be turned into credentials
		if (cert.verification_status !== 'verified') {
			throw apiError.forbidden('Only verified certificates can be issued as credentials');
		}

		// Owner, or a reviewer within the certificate's organization
		const isOwner = cert.student_id === user.id;
		const isReviewerRole = ['admin', 'org_admin', 'super_admin', 'faculty'].includes(role);
		if (!isOwner) {
			if (!isReviewerRole) {
				throw apiError.forbidden('Forbidden to issue for another user');
			}
			const orgContext = await getOrganizationContext(user);
			if (!getTargetOrganizationIds(orgContext).includes(cert.organization_id)) {
				throw apiError.forbidden('Certificate is outside your organization');
			}
		}

		const subject: CredentialSubject = {
			id: cert.student_id,
			certificateId: cert.id,
			title: cert.title,
			institution: cert.institution,
			dateIssued: cert.date_issued,
			description: cert.description ?? undefined,
		};

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
		throw apiError.internal('Failed to store credential');
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
		return apiError.internal('Failed to issue verifiable credential');
	}
});






