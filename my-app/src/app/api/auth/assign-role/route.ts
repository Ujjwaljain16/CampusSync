import { NextRequest } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabaseServer';
import { withRole, success, apiError, parseAndValidateBody, isUuid, resolveAdminOrg, writeAudit } from '@/lib/api';
import { applyRoleChange } from '@/lib/api/utils/roleMutations';

interface AssignRoleBody {
  userId: string;
  role: string;
  organizationId?: string;
}

/**
 * POST /api/auth/assign-role
 *
 * Assign a low-privilege role (student / faculty) to a user INSIDE an
 * organization the caller administers. Authorization comes from the session
 * and is checked against that organization (admin of org A cannot assign in
 * org B). The change goes through the same guarded path as /api/admin/roles.
 */
export const POST = withRole(['admin', 'org_admin', 'super_admin'], async (req: NextRequest, { user }) => {
  const result = await parseAndValidateBody<AssignRoleBody>(req, ['userId', 'role']);
  if (result.error) return result.error;

  const { userId, role, organizationId: requestedOrgId } = result.data;

  if (!isUuid(userId)) return apiError.badRequest('Invalid userId');
  if (!['student', 'faculty'].includes(role)) {
    return apiError.badRequest('Invalid role');
  }

  const scope = await resolveAdminOrg(user, requestedOrgId || req.headers.get('X-Organization-ID'), 'admin');
  const supabase = await createSupabaseAdminClient();

  const change = await applyRoleChange(supabase, {
    actorId: user.id,
    actorRole: scope.role,
    orgId: scope.organizationId,
    targetUserId: userId,
    newRole: role,
  });
  if (!change.ok) return change.response;

  await writeAudit(supabase, {
    actorId: user.id,
    action: 'role_assign',
    targetType: 'user_role',
    targetId: userId,
    organizationId: scope.organizationId,
    details: { old_role: change.oldRole, new_role: role, via: 'auth/assign-role' },
  });

  return success({ success: true }, `Role '${role}' assigned successfully`);
});
