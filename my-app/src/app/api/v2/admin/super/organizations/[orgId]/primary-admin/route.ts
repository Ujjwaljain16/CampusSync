import { withSession, withSuperAdmin, success, apiError, authorizeOrg, isUuid, writeAudit } from '@/lib/api';
import { createSupabaseAdminClient } from '@/lib/supabaseServer';
import { getTargetRoleRow } from '@/lib/api/utils/roleIntegrity';
import { applyRoleChange } from '@/lib/api/utils/roleMutations';
import { promotePrimaryAdmin } from '@/lib/api/utils/orgAdmins';

/**
 * POST /api/v2/admin/super/organizations/[orgId]/primary-admin
 * Transfer primary admin status. ONLY super_admins.
 *
 * Body: { new_primary_admin_id }   (what the UI sends; the current primary
 *        admin is looked up server-side)
 *   or  { from_user_id, to_user_id } (legacy form; from_user_id must be the
 *        current primary admin)
 *
 * The new primary must be an approved org_admin of THIS organization (an
 * `admin` is promoted to org_admin as part of the transfer because
 * is_primary_admin requires role = org_admin).
 */
export const POST = withSuperAdmin<{ orgId: string }>(async (req, { user, params }) => {
  const { orgId } = params;
  if (!isUuid(orgId)) return apiError.badRequest('Invalid organization id');

  let body: { new_primary_admin_id?: unknown; to_user_id?: unknown; from_user_id?: unknown };
  try {
    body = await req.json();
  } catch {
    return apiError.badRequest('Invalid JSON body');
  }

  const toUserId = body.new_primary_admin_id ?? body.to_user_id;
  const fromUserId = body.from_user_id;
  if (!toUserId) return apiError.validation('Missing required fields: new_primary_admin_id');
  if (typeof toUserId !== 'string' || !isUuid(toUserId)) return apiError.validation('Invalid new_primary_admin_id');
  if (fromUserId !== undefined && (typeof fromUserId !== 'string' || !isUuid(fromUserId))) {
    return apiError.validation('Invalid from_user_id');
  }

  const db = await createSupabaseAdminClient();

  const { data: org, error: orgError } = await db.from('organizations').select('id').eq('id', orgId).maybeSingle();
  if (orgError) {
    console.error('[primary-admin] org lookup failed:', orgError);
    return apiError.internal('Failed to transfer primary admin');
  }
  if (!org) return apiError.notFound('Organization not found');

  // Current primary admin(s), looked up server-side
  const { data: currentRows, error: currentError } = await db
    .from('user_roles')
    .select('user_id')
    .eq('organization_id', orgId)
    .eq('is_primary_admin', true);
  if (currentError) {
    console.error('[primary-admin] lookup failed:', currentError);
    return apiError.internal('Failed to transfer primary admin');
  }
  const currentPrimary = ((currentRows ?? []) as Array<{ user_id: string }>)[0]?.user_id ?? null;

  if (fromUserId && fromUserId !== currentPrimary) {
    return apiError.validation('Source user is not the primary admin of this organization');
  }
  if (currentPrimary === toUserId) {
    return apiError.validation('Target user is already the primary admin');
  }

  // Target must belong to this organization (exact row) and be an approved admin
  const target = await getTargetRoleRow(db, toUserId, orgId);
  if (!target) return apiError.validation('Target user must be in the same organization');
  if (target.approval_status !== 'approved' || !['org_admin', 'admin'].includes(target.role)) {
    return apiError.validation('Target user must be an approved admin of this organization');
  }

  if (target.role === 'admin') {
    const upgraded = await applyRoleChange(db, {
      actorId: user.id,
      actorRole: 'super_admin',
      orgId,
      targetUserId: toUserId,
      newRole: 'org_admin',
    });
    if (!upgraded.ok) return upgraded.response;
  }

  const promoted = await promotePrimaryAdmin(db, orgId, toUserId, user.id);
  if (!promoted.ok) {
    return promoted.status === 422 ? apiError.validation(promoted.error) : apiError.internal(promoted.error);
  }

  await writeAudit(db, {
    actorId: user.id,
    action: 'transfer_primary_admin',
    targetType: 'organization',
    targetId: orgId,
    organizationId: orgId,
    details: { from_user_id: currentPrimary, to_user_id: toUserId },
  });

  return success(
    {
      success: true,
      from_user_id: currentPrimary,
      to_user_id: toUserId,
      organization_id: orgId,
      message: 'Primary admin status transferred successfully',
    },
    'Primary admin transferred successfully'
  );
});

/**
 * GET /api/v2/admin/super/organizations/[orgId]/primary-admin
 * The primary admin of an organization. Caller must be an admin OF THAT
 * organization (or super_admin) - not any admin anywhere.
 */
export const GET = withSession<{ orgId: string }>(async (_req, { user, params }) => {
  const { orgId } = params;
  if (!isUuid(orgId)) return apiError.badRequest('Invalid organization id');

  await authorizeOrg(user, { orgId, minRole: 'admin' });

  const db = await createSupabaseAdminClient();
  const { data: rows, error } = await db
    .from('user_roles')
    .select('user_id')
    .eq('organization_id', orgId)
    .eq('is_primary_admin', true)
    .limit(1);
  if (error) {
    console.error('[primary-admin] fetch failed:', error);
    return apiError.internal('Failed to fetch primary admin');
  }
  const primaryId = ((rows ?? []) as Array<{ user_id: string }>)[0]?.user_id;
  if (!primaryId) return apiError.notFound('No primary admin found for this organization');

  const { data: profile } = await db
    .from('profiles')
    .select('email, full_name')
    .eq('id', primaryId)
    .maybeSingle();

  return success({
    user_id: primaryId,
    email: profile?.email ?? null,
    full_name: profile?.full_name ?? null,
  });
});
