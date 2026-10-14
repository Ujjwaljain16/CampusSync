import { NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { success, apiError, isUuid, authorizeOrg, withSession } from '@/lib/api';

const REVIEWER_ROLES = ['faculty', 'admin', 'org_admin', 'super_admin'] as const;

/**
 * GET /api/certificates/metadata/[certificateId]
 *
 * Extraction metadata (confidence, evidence, method) for one certificate.
 * Visible to the certificate's owner and to APPROVED reviewers of the
 * certificate's own organization — nobody else (recruiters never see it).
 */
export const GET = withSession<{ certificateId: string }>(async (_req: NextRequest, { user, params }) => {
  const { certificateId } = params;
  if (!isUuid(certificateId)) return apiError.badRequest('Invalid certificate id');

  const supabase = await createSupabaseServerClient();

  const { data: certificate, error: certError } = await supabase
    .from('certificates')
    .select('id, student_id, organization_id, confidence_score, verification_details, auto_approved, verification_method, created_at')
    .eq('id', certificateId)
    .maybeSingle();

  if (certError) {
    console.error('[certificates/metadata] certificate lookup failed', certError);
    return apiError.internal('Failed to load certificate');
  }
  // Same answer for "does not exist" and "not yours": do not reveal existence.
  if (!certificate) return apiError.notFound('Certificate not found');

  if (certificate.student_id !== user.id) {
    if (!certificate.organization_id) return apiError.notFound('Certificate not found');
    try {
      await authorizeOrg(user, { orgId: certificate.organization_id, roles: REVIEWER_ROLES });
    } catch (err) {
      if (err instanceof Response && err.status === 403) return apiError.notFound('Certificate not found');
      throw err;
    }
  }

  const { data: metadata, error: metadataError } = await supabase
    .from('certificate_metadata')
    .select('*')
    .eq('certificate_id', certificateId)
    .maybeSingle();

  if (metadata && !metadataError) {
    return success({ data: metadata });
  }

  // No separate metadata row: derive it from the certificate itself.
  return success({
    data: {
      certificate_id: certificate.id,
      ai_confidence_score: certificate.confidence_score ?? null,
      verification_details: certificate.verification_details || {},
      auto_approved: certificate.auto_approved || false,
      verification_method: certificate.verification_method || null,
      created_at: certificate.created_at,
    },
  });
});
