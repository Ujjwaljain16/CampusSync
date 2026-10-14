import { NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { withRole, success, error as errorResponse, apiError, parseAndValidateBody, isValidUUID } from '@/lib/api';
import { applyCertificateTransition, resolveActor } from '@/lib/services/certificateService';

interface RevertApprovalBody {
  certificateId: string;
  reason?: string;
}

export const POST = withRole(['faculty', 'admin', 'org_admin', 'super_admin'], async (req: NextRequest, { user }) => {
  const result = await parseAndValidateBody<RevertApprovalBody>(req, ['certificateId']);
  if (result.error) return result.error;

  const { certificateId, reason } = result.data;
  if (typeof certificateId !== 'string' || !isValidUUID(certificateId)) {
    throw apiError.badRequest('A valid certificateId is required');
  }

  const supabase = await createSupabaseServerClient();
  const actor = await resolveActor(supabase, user.id);

  // verified -> pending; the service revokes ALL active credentials of the certificate
  // and rolls the status change back if revocation fails.
  const outcome = await applyCertificateTransition(supabase, {
    certificateId,
    action: 'revert',
    actor,
    notes: typeof reason === 'string' && reason.length > 0 ? reason : 'Approval reverted by faculty',
  });

  if (!outcome.ok) {
    return errorResponse(outcome.error, outcome.status, { code: outcome.code });
  }

  return success(
    {
      success: true,
      certificateId,
      newStatus: 'pending',
      revokedCredentials: outcome.revokedCredentials,
    },
    'Certificate approval reverted successfully'
  );
});
