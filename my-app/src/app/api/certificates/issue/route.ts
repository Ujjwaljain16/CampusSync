import { NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { withAuth, success, error as errorResponse, apiError, isValidUUID } from '@/lib/api';
import { issueCredentialForCertificate, resolveActor } from '@/lib/services/certificateService';

interface IssueBody {
	credentialSubject?: { certificateId?: string };
	certificateId?: string;
}

export const POST = withAuth(async (req: NextRequest, { user }) => {
	try {
		const body = await req.json().catch(() => null) as IssueBody | null;
		if (!body) throw apiError.badRequest('Invalid JSON');

		// SECURITY: the credential subject is ALWAYS built from the stored, verified
		// certificate record. Client-supplied subject fields are ignored so nobody
		// can obtain an issuer-signed credential for arbitrary claims.
		const certificateId = body.certificateId ?? body.credentialSubject?.certificateId;
		if (!certificateId || typeof certificateId !== 'string' || !isValidUUID(certificateId)) {
			throw apiError.badRequest('A valid certificateId is required');
		}

		const supabase = await createSupabaseServerClient();
		const actor = await resolveActor(supabase, user.id);

		// Idempotent: an existing ACTIVE credential for the certificate is returned
		// (reused: true) instead of minting another one.
		const issued = await issueCredentialForCertificate(supabase, { certificateId, actor });
		if (!issued.ok) {
			return errorResponse(issued.error, issued.status, { code: issued.code });
		}

		if (issued.reused) {
			return success({ ...issued.vc, reused: true }, 'Existing verifiable credential returned', 200);
		}
		return success(issued.vc, 'Verifiable credential issued successfully', 201);
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
