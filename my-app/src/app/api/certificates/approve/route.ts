import { NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { withRole, success, error as errorResponse, apiError, parseAndValidateBody, isValidUUID } from '@/lib/api';
import {
  applyCertificateTransition,
  issueCredentialForCertificate,
  normalizeReviewStatus,
  resolveActor,
} from '@/lib/services/certificateService';

interface ApproveBody {
  certificateId: string;
  /** 'verified' | 'rejected' (legacy 'approved' is accepted and mapped to 'verified'). */
  status: string;
  notes?: string;
  approveReason?: string;
  rejectReason?: string;
  /** When approving, also issue the signed credential in this request. */
  issue?: boolean;
}

export const POST = withRole(['faculty', 'admin', 'org_admin', 'super_admin'], async (req: NextRequest, { user }) => {
  const result = await parseAndValidateBody<ApproveBody>(req, ['certificateId', 'status']);
  if (result.error) return result.error;
  const body = result.data;

  if (typeof body.certificateId !== 'string' || !isValidUUID(body.certificateId)) {
    throw apiError.badRequest('A valid certificateId is required');
  }
  const target = normalizeReviewStatus(body.status);
  if (!target) {
    throw apiError.badRequest('Status must be verified or rejected');
  }

  const supabase = await createSupabaseServerClient();
  const actor = await resolveActor(supabase, user.id);
  const notes = [body.notes, body.approveReason, body.rejectReason].find(v => typeof v === 'string' && v.length > 0);

  const outcome = await applyCertificateTransition(supabase, {
    certificateId: body.certificateId,
    action: target === 'verified' ? 'approve' : 'reject',
    actor,
    notes,
  });

  if (!outcome.ok) {
    return errorResponse(outcome.error, outcome.status, { code: outcome.code });
  }

  const data: Record<string, unknown> = {
    certificateId: outcome.certificateId,
    status: outcome.to,
    verificationStatus: outcome.to,
    revokedCredentials: outcome.revokedCredentials,
  };

  if (target === 'verified' && body.issue === true) {
    const issued = await issueCredentialForCertificate(supabase, { certificateId: outcome.certificateId, actor });
    data.issuance = issued.ok
      ? { ok: true, reused: issued.reused, credentialId: issued.vc.id }
      : { ok: false, error: issued.error };
  }

  return success(data, `Certificate ${outcome.to} successfully`);
});
