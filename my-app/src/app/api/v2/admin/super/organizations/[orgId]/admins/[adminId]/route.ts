import { NextResponse } from 'next/server';
import { withSuperAdmin, apiError, isUuid, writeAudit } from '@/lib/api';
import { createSupabaseAdminClient } from '@/lib/supabaseServer';
import { getTargetRoleRow } from '@/lib/api/utils/roleIntegrity';
import { applyRoleChange } from '@/lib/api/utils/roleMutations';

/**
 * DELETE /api/v2/admin/super/organizations/[orgId]/admins/[adminId]
 * Remove an admin from an organization (super admin only).
 * Refused for the primary admin (transfer first) and for the last admin.
 */
export const DELETE = withSuperAdmin<{ orgId: string; adminId: string }>(async (_request, { user, params }) => {
  const { orgId, adminId } = params;
  if (!isUuid(orgId) || !isUuid(adminId)) return apiError.badRequest('Invalid id');

  const db = await createSupabaseAdminClient();

  const adminRole = await getTargetRoleRow(db, adminId, orgId);
  if (!adminRole || !['org_admin', 'admin'].includes(adminRole.role)) {
    return apiError.notFound('Admin not found in this organization');
  }

  // Shared guarded path: primary admin / last admin / self-removal are refused there
  const result = await applyRoleChange(db, {
    actorId: user.id,
    actorRole: 'super_admin',
    orgId,
    targetUserId: adminId,
    newRole: null,
  });
  if (!result.ok) return result.response;

  await writeAudit(db, {
    actorId: user.id,
    action: 'org_admin_remove',
    targetType: 'user_role',
    targetId: adminId,
    organizationId: orgId,
    details: { old_role: adminRole.role },
  });

  return NextResponse.json({ message: 'Admin removed successfully' });
});
