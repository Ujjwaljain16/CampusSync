import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabaseServer';
import { withSession, apiError, resolveAdminOrg, isUuid, writeAudit } from '@/lib/api';

/**
 * POST /api/admin/org/revoke-access
 *
 * Revoke a recruiter's access to the caller's organization. Recruiter data
 * routes read approved per-org `user_roles` rows, so revoking = flipping that
 * row to approval_status='denied' (the database has no 'revoked' status).
 * Body: { recruiterId, reason? }
 */
export const POST = withSession(async (request, { user }) => {
  let body: { recruiterId?: unknown; reason?: unknown };
  try {
    body = await request.json();
  } catch {
    return apiError.badRequest('Invalid JSON body');
  }
  const { recruiterId } = body;
  const reason = typeof body.reason === 'string' ? body.reason.slice(0, 1000) : null;

  if (!recruiterId) return apiError.badRequest('recruiterId is required');
  if (typeof recruiterId !== 'string' || !isUuid(recruiterId)) return apiError.validation('Invalid recruiterId');

  const requestedOrg = request.headers.get('X-Organization-ID') || new URL(request.url).searchParams.get('organization_id');
  const scope = await resolveAdminOrg(user, requestedOrg, 'admin');
  const admin = await createSupabaseAdminClient();

  const now = new Date().toISOString();
  const { data: updated, error: updateError } = await admin
    .from('user_roles')
    .update({
      approval_status: 'denied',
      approval_notes: reason || 'Access revoked by organization admin',
      approved_by: user.id,
      updated_at: now,
    })
    .eq('user_id', recruiterId)
    .eq('organization_id', scope.organizationId)
    .eq('role', 'recruiter')
    .eq('approval_status', 'approved')
    .select('user_id');

  if (updateError) {
    console.error('[REVOKE_ACCESS] Update failed:', updateError);
    return apiError.internal('Failed to revoke access');
  }
  if (!updated || updated.length === 0) {
    return apiError.notFound('No approved access found for this recruiter');
  }

  await writeAudit(admin, {
    actorId: user.id,
    action: 'recruiter_access_revoked',
    targetType: 'recruiter_access',
    targetId: recruiterId,
    organizationId: scope.organizationId,
    details: { reason },
  });

  return NextResponse.json({ success: true, message: 'Access revoked successfully' });
});
