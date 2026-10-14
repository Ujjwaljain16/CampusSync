import { NextRequest } from 'next/server';
import {
  withRole,
  success,
  apiError,
  parseAndValidateBody,
  resolveAdminOrg,
  isUuid,
  isKnownRole,
  writeAudit,
} from '@/lib/api';
import { createSupabaseAdminClient } from '@/lib/supabaseServer';
import { getTargetRoleRow } from '@/lib/api/utils/roleIntegrity';
import { applyRoleChange } from '@/lib/api/utils/roleMutations';

interface RoleChangeRequest {
  user_id: string;
  new_role: 'student' | 'faculty' | 'recruiter' | 'admin' | 'org_admin';
  organization_id?: string | null;
  reason?: string;
  transfer_data?: boolean; // Reserved: role-specific data handling (data is always preserved)
}

/**
 * POST /api/admin/roles/change
 * Change a user's role inside ONE organization.
 *  - caller must be admin-class IN that organization (not merely somewhere)
 *  - hierarchy: caller must outrank the target's old and the new role
 *    (super_admin cannot be granted here; org_admin only by super_admin)
 *  - no self-change; primary admin and last admin are protected
 */
export const POST = withRole(['admin', 'org_admin', 'super_admin'], async (req: NextRequest, { user }) => {
  const result = await parseAndValidateBody<RoleChangeRequest>(req, ['user_id', 'new_role']);
  if (result.error) return result.error;
  const body = result.data;

  if (!isUuid(body.user_id)) return apiError.validation('Invalid user_id');
  // super_admin is deliberately not assignable through this endpoint
  if (!['student', 'faculty', 'recruiter', 'admin', 'org_admin'].includes(body.new_role) || !isKnownRole(body.new_role)) {
    return apiError.badRequest('Invalid role');
  }

  const requestedOrgId = body.organization_id || req.headers.get('X-Organization-ID');
  const scope = await resolveAdminOrg(user, requestedOrgId, 'admin');
  const adminSupabase = await createSupabaseAdminClient();

  // Exact (user, org) row: never "the first row of this user"
  const current = await getTargetRoleRow(adminSupabase, body.user_id, scope.organizationId);
  const oldRole = current?.role ?? 'student';

  // Admin demotion must be justified
  if (current && ['admin', 'org_admin'].includes(current.role) && !['admin', 'org_admin'].includes(body.new_role)) {
    if (!body.reason || body.reason.trim().length < 10) {
      return apiError.badRequest('Admin demotion requires a detailed reason (minimum 10 characters)');
    }
  }

  const change = await applyRoleChange(adminSupabase, {
    actorId: user.id,
    actorRole: scope.role,
    orgId: scope.organizationId,
    targetUserId: body.user_id,
    newRole: body.new_role,
  });
  if (!change.ok) return change.response;

  await writeAudit(adminSupabase, {
    actorId: user.id,
    action: 'role_change',
    targetType: 'user_role',
    targetId: body.user_id,
    organizationId: scope.organizationId,
    details: {
      old_role: oldRole,
      new_role: body.new_role,
      reason: body.reason || 'No reason provided',
    },
  });

  return success({
    user_id: body.user_id,
    organization_id: scope.organizationId,
    old_role: oldRole,
    new_role: body.new_role,
    message: 'Role changed successfully',
    data_handling: 'User data preserved, access permissions updated',
  });
});
