import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabaseServer';
import { withSession, apiError, isUuid } from '@/lib/api';
import { createRecruiterAccessRequest } from '@/lib/api/utils/recruiterAccess';

/**
 * GET /api/recruiter/access-requests
 * All organization access requests (per-org recruiter rows in user_roles)
 * of the current recruiter.
 */
export const GET = withSession(async (_request, { user }) => {
  const adminClient = await createSupabaseAdminClient();

  // Verify the user is an APPROVED platform-level recruiter
  const { data: platformRows } = await adminClient
    .from('user_roles')
    .select('approval_status')
    .eq('user_id', user.id)
    .eq('role', 'recruiter')
    .is('organization_id', null)
    .limit(1);
  const platformRole = (platformRows ?? [])[0] as { approval_status?: string } | undefined;

  if (!platformRole || platformRole.approval_status !== 'approved') {
    return apiError.forbidden('Recruiter role required');
  }

  const { data: requests, error: requestsError } = await adminClient
    .from('user_roles')
    .select('organization_id, approval_status, created_at, approved_at')
    .eq('user_id', user.id)
    .eq('role', 'recruiter')
    .not('organization_id', 'is', null)
    .order('created_at', { ascending: false });

  if (requestsError) {
    console.error('[RECRUITER-ACCESS-REQUESTS-GET] Failed to fetch access requests:', requestsError);
    return apiError.internal('Failed to fetch access requests');
  }

  const accessRequests = (requests ?? []).map((req: {
    organization_id: string;
    approval_status: string;
    created_at: string;
    approved_at: string | null;
  }) => ({
    organization_id: req.organization_id,
    status: req.approval_status,
    requested_at: req.created_at,
    approved_at: req.approved_at,
  }));

  return NextResponse.json({ success: true, data: accessRequests });
});

/**
 * POST /api/recruiter/access-requests
 * Request access to a specific organization. Body: { organization_id }
 */
export const POST = withSession(async (request, { user }) => {
  let body: { organization_id?: unknown };
  try {
    body = await request.json();
  } catch {
    return apiError.badRequest('Invalid JSON body');
  }
  const organization_id = body.organization_id;

  if (!organization_id) return apiError.badRequest('organization_id is required');
  if (typeof organization_id !== 'string' || !isUuid(organization_id)) {
    return apiError.validation('Invalid organization_id');
  }

  const adminClient = await createSupabaseAdminClient();
  const outcome = await createRecruiterAccessRequest(adminClient, user.id, organization_id);

  if (outcome.status === 201) {
    return NextResponse.json({
      success: true,
      message: outcome.body.message,
      data: {
        organization_id,
        status: 'pending',
        requested_at: outcome.body.requested_at,
      },
    });
  }
  return NextResponse.json(outcome.body, { status: outcome.status });
});
