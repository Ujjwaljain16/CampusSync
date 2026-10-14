import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabaseServer';
import {
  withSession,
  apiError,
  error as errorResponse,
  authorizeOrg,
  assertSuperAdmin,
  fetchApprovedRoleRows,
  resolveAdminOrg,
  isUuid,
  writeAudit,
} from '@/lib/api';

const REVIEWABLE_ROLES = ['faculty', 'recruiter'];

/**
 * GET /api/admin/faculty-approvals
 *
 * Faculty and recruiter approval requests.
 *  - org admins: only their organization (per-org faculty rows and per-org
 *    recruiter access requests)
 *  - super admins: everything, including platform-level recruiters (NULL org)
 * Query params:
 *  - status: 'pending' | 'approved' | 'denied' | 'all' (default: 'pending')
 *  - role: 'faculty' | 'recruiter' | 'all' (default: 'all')
 *  - organization_id: optional organization to look at
 */
export const GET = withSession(async (request, { user }) => {
  const { searchParams } = new URL(request.url);
  const statusFilter = searchParams.get('status') || 'pending';
  const roleFilter = searchParams.get('role') || 'all';
  if (!['pending', 'approved', 'denied', 'all'].includes(statusFilter)) return apiError.validation('Invalid status');
  if (!['faculty', 'recruiter', 'all'].includes(roleFilter)) return apiError.validation('Invalid role');

  const requestedOrg = request.headers.get('X-Organization-ID') || searchParams.get('organization_id');
  const scope = await resolveAdminOrg(user, requestedOrg, 'admin');
  const adminClient = await createSupabaseAdminClient();

  let query = adminClient
    .from('user_roles')
    .select('user_id, organization_id, role, approval_status, created_at, approved_at, approved_by, approval_notes')
    .in('role', REVIEWABLE_ROLES);

  if (scope.isSuperAdmin && !scope.requested) {
    // Platform view: all faculty + every recruiter row (platform-level and per-org)
  } else {
    query = query.eq('organization_id', scope.organizationId);
  }

  if (statusFilter !== 'all') query = query.eq('approval_status', statusFilter);
  if (roleFilter !== 'all') query = query.eq('role', roleFilter);
  query = query.order('created_at', { ascending: false });

  const { data: requests, error: requestsError } = await query;
  if (requestsError) {
    console.error('[faculty-approvals] fetch failed:', requestsError);
    return apiError.internal('Failed to fetch approval requests');
  }

  if (!requests || requests.length === 0) {
    return NextResponse.json({ success: true, data: [] });
  }

  type Req = {
    user_id: string;
    role: string;
    organization_id: string | null;
    approval_status: string;
    created_at: string;
    approved_at: string | null;
    approved_by: string | null;
    approval_notes: string | null;
  };
  const rows = requests as Req[];

  const userIds = [...new Set(rows.map((r) => r.user_id))];
  const orgIds = [...new Set(rows.map((r) => r.organization_id).filter((id): id is string => !!id))];

  const { data: profiles } = await adminClient
    .from('profiles')
    .select('id, email, full_name, company_name')
    .in('id', userIds);
  const { data: organizations } = orgIds.length
    ? await adminClient.from('organizations').select('id, name').in('id', orgIds)
    : { data: [] as Array<{ id: string; name: string }> };

  type Profile = { id: string; email: string; full_name: string; company_name?: string };
  type Organization = { id: string; name: string };
  const profileMap = new Map<string, Profile>(((profiles || []) as Profile[]).map((p) => [p.id, p]));
  const orgMap = new Map<string, Organization>(((organizations || []) as Organization[]).map((o) => [o.id, o]));

  const transformedData = rows.map((r) => {
    const profile = profileMap.get(r.user_id);
    const org = r.organization_id ? orgMap.get(r.organization_id) : undefined;
    const displayOrganization =
      r.role === 'recruiter' && !r.organization_id
        ? profile?.company_name || 'Platform Access'
        : org?.name || 'Unknown Organization';

    return {
      user_id: r.user_id,
      role: r.role,
      organization_id: r.organization_id,
      approval_status: r.approval_status,
      created_at: r.created_at,
      approved_at: r.approved_at,
      approved_by: r.approved_by,
      approval_notes: r.approval_notes,
      user_email: profile?.email || 'Unknown',
      user_name: profile?.full_name || profile?.email?.split('@')[0] || 'Unknown User',
      organization_name: displayOrganization,
      company_name: profile?.company_name || null,
    };
  });

  return NextResponse.json({ success: true, data: transformedData });
});

/**
 * POST /api/admin/faculty-approvals
 *
 * Approve or deny ONE pending faculty/recruiter row, identified by
 * (user_id, organization_id). organization_id: null targets the
 * platform-level recruiter row (super admins only).
 *
 * Body: { user_id, organization_id?, approval_status: 'approved' | 'denied', notes? }
 */
export const POST = withSession(async (request, { user }) => {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return apiError.badRequest('Invalid JSON body');
  }
  const user_id = body.user_id;
  const approval_status = (body.approval_status ?? body.status) as string | undefined;
  const notes = typeof body.notes === 'string' ? body.notes.slice(0, 1000) : null;

  if (!user_id || !approval_status) {
    return apiError.badRequest('Missing required fields: user_id, approval_status');
  }
  if (typeof user_id !== 'string' || !isUuid(user_id)) return apiError.validation('Invalid user_id');
  if (!['approved', 'denied'].includes(approval_status)) {
    return apiError.badRequest('Invalid status. Must be "approved" or "denied"');
  }
  if (user_id === user.id) return apiError.forbidden('You cannot review your own request');

  const adminClient = await createSupabaseAdminClient();
  const callerIsSuper = (await fetchApprovedRoleRows(user.id)).some((r) => r.role === 'super_admin');

  // Which row? Explicit organization_id wins (null = platform level)
  let orgId: string | null;
  if (body.organization_id === null) {
    orgId = null;
  } else if (typeof body.organization_id === 'string') {
    if (!isUuid(body.organization_id)) return apiError.validation('Invalid organization_id');
    orgId = body.organization_id;
  } else {
    // Not specified: the single pending row the caller is allowed to review
    const { data: pendingRows } = await adminClient
      .from('user_roles')
      .select('organization_id')
      .eq('user_id', user_id)
      .eq('approval_status', 'pending')
      .in('role', REVIEWABLE_ROLES);
    const candidates = (pendingRows ?? []) as Array<{ organization_id: string | null }>;
    if (candidates.length === 0) return apiError.notFound('User role not found or already processed');
    if (candidates.length > 1 && !callerIsSuper) {
      const scope = await resolveAdminOrg(user, null, 'admin');
      orgId = scope.organizationId;
    } else if (candidates.length > 1) {
      return apiError.validation('User has several pending requests; specify organization_id');
    } else {
      orgId = candidates[0].organization_id;
    }
  }

  // Authorization for THAT row's organization
  if (orgId === null) {
    await assertSuperAdmin(user); // platform-level recruiter access
  } else {
    await authorizeOrg(user, { orgId, minRole: 'admin' });
  }

  // Claim the exact pending row (user, org) with a conditional update
  let updateQuery = adminClient
    .from('user_roles')
    .update({
      approval_status,
      approved_by: user.id,
      approved_at: new Date().toISOString(),
      approval_notes: notes,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', user_id)
    .in('role', REVIEWABLE_ROLES)
    .eq('approval_status', 'pending');
  updateQuery = orgId === null ? updateQuery.is('organization_id', null) : updateQuery.eq('organization_id', orgId);

  const { data: updated, error: updateError } = await updateQuery.select();
  if (updateError) {
    console.error('[faculty-approvals] update failed:', updateError);
    return apiError.internal('Failed to update approval status');
  }
  if (!updated || updated.length === 0) {
    return errorResponse('Approval request not found or already processed', 404);
  }
  const updatedRole = updated[0] as { role: string };

  await writeAudit(adminClient, {
    actorId: user.id,
    action: approval_status === 'approved' ? 'access_approve' : 'access_deny',
    targetType: 'user_role',
    targetId: user_id,
    organizationId: orgId,
    details: { role: updatedRole.role, status: approval_status },
  });

  const { data: userProfile } = await adminClient
    .from('profiles')
    .select('email, full_name')
    .eq('id', user_id)
    .maybeSingle();

  return NextResponse.json({
    success: true,
    message: `${updatedRole.role} request ${approval_status}`,
    user: {
      user_id,
      email: userProfile?.email,
      full_name: userProfile?.full_name,
      role: updatedRole.role,
      status: approval_status,
    },
  });
});
