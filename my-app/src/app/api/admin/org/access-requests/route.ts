import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabaseServer';
import { withSession, apiError, error as errorResponse, resolveAdminOrg, isUuid, writeAudit } from '@/lib/api';

/**
 * Recruiter access to an organization lives in ONE place: per-organization
 * `user_roles` rows with role='recruiter' (approval_status pending / approved /
 * denied). Every recruiter data route reads those rows, so approving or
 * revoking here really grants or removes data access.
 * (The legacy recruiter_org_access table no longer drives anything.)
 */

type AccessRow = {
  id: string;
  user_id: string;
  organization_id: string;
  approval_status: string;
  created_at: string;
  approval_notes: string | null;
};

function requestedOrg(request: Request): string | null {
  return request.headers.get('X-Organization-ID') || new URL(request.url).searchParams.get('organization_id');
}

/**
 * GET /api/admin/org/access-requests
 * Pending recruiter access requests for the caller's organization.
 */
export const GET = withSession(async (request, { user }) => {
  const scope = await resolveAdminOrg(user, requestedOrg(request), 'admin');
  const admin = await createSupabaseAdminClient();

  const { data, error } = await admin
    .from('user_roles')
    .select('id, user_id, organization_id, approval_status, created_at, approval_notes')
    .eq('organization_id', scope.organizationId)
    .eq('role', 'recruiter')
    .eq('approval_status', 'pending')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[GET_ACCESS_REQUESTS] Error:', error);
    return apiError.internal('Failed to fetch access requests');
  }

  const requests = (data ?? []) as AccessRow[];
  const recruiterIds = requests.map((r) => r.user_id);
  const { data: profiles } = recruiterIds.length
    ? await admin.from('profiles').select('id, full_name, company_name, email').in('id', recruiterIds)
    : { data: [] };
  type Profile = { id: string; full_name?: string; company_name?: string; email?: string };
  const profileMap = new Map(((profiles ?? []) as Profile[]).map((p) => [p.id, p]));

  const transformedRequests = requests.map((r) => {
    const profile = profileMap.get(r.user_id);
    return {
      id: r.id,
      status: r.approval_status,
      requestedAt: r.created_at,
      notes: r.approval_notes,
      recruiter: {
        id: r.user_id,
        email: profile?.email,
        fullName: profile?.full_name,
        company: profile?.company_name,
      },
    };
  });

  return NextResponse.json({ requests: transformedRequests, count: transformedRequests.length });
});

/**
 * POST /api/admin/org/access-requests
 * Approve / deny a recruiter access request (a pending per-org recruiter row).
 * Body: { requestId, action: 'approve' | 'deny', reviewNotes? }
 */
export const POST = withSession(async (request, { user }) => {
  let body: { requestId?: unknown; action?: unknown; reviewNotes?: unknown };
  try {
    body = await request.json();
  } catch {
    return apiError.badRequest('Invalid JSON body');
  }
  const { requestId, action } = body;
  const reviewNotes = typeof body.reviewNotes === 'string' ? body.reviewNotes.slice(0, 1000) : null;

  if (!requestId || !action) return apiError.badRequest('requestId and action are required');
  if (typeof requestId !== 'string' || !isUuid(requestId)) return apiError.validation('Invalid requestId');
  if (action !== 'approve' && action !== 'deny') return apiError.badRequest('action must be "approve" or "deny"');

  const scope = await resolveAdminOrg(user, requestedOrg(request), 'admin');
  const admin = await createSupabaseAdminClient();

  // The request row must belong to the caller's organization
  const { data: rows, error: fetchError } = await admin
    .from('user_roles')
    .select('id, user_id, organization_id, approval_status')
    .eq('id', requestId)
    .eq('organization_id', scope.organizationId)
    .eq('role', 'recruiter')
    .limit(1);

  if (fetchError) {
    console.error('[REVIEW_REQUEST] fetch failed:', fetchError);
    return apiError.internal('Failed to load access request');
  }
  const accessRequest = (rows ?? [])[0] as AccessRow | undefined;
  if (!accessRequest) return apiError.notFound('Access request not found');
  if (accessRequest.user_id === user.id) return apiError.forbidden('You cannot review your own request');
  if (accessRequest.approval_status !== 'pending') {
    return errorResponse('This request has already been reviewed', 409);
  }

  if (action === 'approve') {
    // Org access only makes sense for a recruiter approved platform-wide
    const { data: platform } = await admin
      .from('user_roles')
      .select('user_id')
      .eq('user_id', accessRequest.user_id)
      .eq('role', 'recruiter')
      .eq('approval_status', 'approved')
      .is('organization_id', null)
      .limit(1);
    if (!platform || platform.length === 0) {
      return errorResponse('This recruiter has not been approved on the platform yet', 409);
    }
  }

  const newStatus = action === 'approve' ? 'approved' : 'denied';
  const now = new Date().toISOString();
  const { data: updated, error: updateError } = await admin
    .from('user_roles')
    .update({
      approval_status: newStatus,
      approved_by: user.id,
      approved_at: now,
      approval_notes: reviewNotes,
      updated_at: now,
    })
    .eq('id', requestId)
    .eq('organization_id', scope.organizationId)
    .eq('approval_status', 'pending')
    .select('id');

  if (updateError) {
    console.error('[REVIEW_REQUEST] Update failed:', updateError);
    return apiError.internal('Failed to update request');
  }
  if (!updated || updated.length === 0) {
    return errorResponse('This request has already been reviewed', 409);
  }

  await writeAudit(admin, {
    actorId: user.id,
    action: `recruiter_access_${newStatus}`,
    targetType: 'recruiter_access',
    targetId: accessRequest.user_id,
    organizationId: scope.organizationId,
    details: { request_id: requestId, review_notes: reviewNotes },
  });

  return NextResponse.json({ success: true, status: newStatus, message: `Access request ${newStatus}` });
});
