/**
 * Certificate Database Verification Endpoint
 *
 * Purpose: lets a recruiter record their own verification / flag on a certificate
 * stored in the database (business-level annotation, separate from the
 * cryptographic check done by /verify-credential).
 *
 * - Multi-tenant: the certificate must belong to one of the caller's organisations
 * - Rate limited, body validated, errors are stable messages (details logged)
 * - Audit logged (failure to audit is logged, not fatal)
 */
import { NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { withRole, success, apiError, getOrganizationContext, getTargetOrganizationIds } from '@/lib/api';
import { getRequestedOrgId } from '@/lib/api/utils/recruiter';
import { enforceRateLimit, RateLimitPresets } from '@/lib/rateLimit';
import { isPlainObject, isUuid } from '@/lib/privacy/sanitize';

const MAX_NOTES = 1000;

export const POST = withRole(['recruiter', 'admin'], async (req: NextRequest, { user }) => {
  const limited = enforceRateLimit(req, 'recruiter-verify-certificate', RateLimitPresets.standard, user.id);
  if (limited) return limited;

  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return apiError.badRequest('Invalid JSON body');
    }
    if (!isPlainObject(body)) return apiError.badRequest('Request body must be a JSON object');

    const { certificate_id, action, notes } = body;
    if (!isUuid(certificate_id)) return apiError.badRequest('A valid certificate_id is required');
    if (action !== 'verify' && action !== 'flag' && action !== 'reject') {
      return apiError.badRequest("action must be 'verify' or 'flag'");
    }
    if (notes !== undefined && notes !== null && (typeof notes !== 'string' || notes.length > MAX_NOTES)) {
      return apiError.badRequest(`notes must be a string of at most ${MAX_NOTES} characters`);
    }
    const verify = action === 'verify';

    const supabase = await createSupabaseServerClient();
    const orgContext = await getOrganizationContext(user, getRequestedOrgId(req));
    const targetOrgIds = getTargetOrganizationIds(orgContext);
    if (targetOrgIds.length === 0) return apiError.forbidden('No approved organization access');

    const { data: certificate, error: certError } = await supabase
      .from('certificates')
      .select('id, title, student_id, organization_id')
      .eq('id', certificate_id)
      .in('organization_id', targetOrgIds)
      .maybeSingle();
    if (certError) {
      console.error('[verify-certificate] lookup failed', certError);
      return apiError.internal('Failed to look up certificate');
    }
    if (!certificate) return apiError.notFound('Certificate not found');

    const now = new Date().toISOString();
    const updateData = {
      recruiter_verified: verify,
      recruiter_notes: typeof notes === 'string' && notes ? notes : null,
      verified_by_recruiter: user.id,
      recruiter_verification_date: now,
      updated_at: now,
    };

    const { error } = await supabase
      .from('certificates')
      .update(updateData)
      .eq('id', certificate_id)
      .in('organization_id', targetOrgIds);
    if (error) {
      console.error('[verify-certificate] update failed', error);
      return apiError.internal('Failed to update certificate');
    }

    const { error: auditError } = await supabase.from('audit_logs').insert({
      user_id: user.id,
      organization_id: certificate.organization_id,
      action: 'recruiter_certificate_verification',
      target_id: certificate_id,
      details: {
        action,
        has_notes: typeof notes === 'string' && notes.length > 0,
        certificate_title: certificate.title,
        student_id: certificate.student_id,
      },
      created_at: now,
    });
    if (auditError) console.error('[verify-certificate] audit insert failed', auditError);

    return success({
      certificate_id,
      action,
      verified: verify,
      verification_date: updateData.recruiter_verification_date,
    });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error('[verify-certificate] failed', err);
    return apiError.internal('Internal server error');
  }
});
