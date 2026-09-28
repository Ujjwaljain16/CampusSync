import { NextRequest } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabaseServer';
import { withRole, success, apiError, parseAndValidateBody, isValidUUID, getOrganizationContext } from '@/lib/api';

interface AssignRoleBody {
  userId: string;
  role: string;
  organizationId?: string;
}

/**
 * POST /api/auth/assign-role
 *
 * Assign a low-privilege role to a user. Caller must be an authenticated
 * admin / org_admin / super_admin; authorization is derived from the session,
 * never from client-supplied identity fields. Only super admins may target an
 * organization other than their own.
 */
export const POST = withRole(['admin', 'org_admin', 'super_admin'], async (req: NextRequest, { user }) => {
  const result = await parseAndValidateBody<AssignRoleBody>(req, ['userId', 'role']);
  if (result.error) return result.error;

  const { userId, role, organizationId: requestedOrgId } = result.data;

  if (!isValidUUID(userId)) throw apiError.badRequest('Invalid userId');
  if (!['student', 'faculty'].includes(role)) {
    throw apiError.badRequest('Invalid role');
  }

  const orgContext = await getOrganizationContext(user, requestedOrgId);
  const organizationId = 'organizationId' in orgContext ? orgContext.organizationId : undefined;
  if (!organizationId) throw apiError.badRequest('organization_id is required');

  const supabase = await createSupabaseAdminClient();

  // Do not overwrite roles of users in other organizations.
  const { data: existing } = await supabase
    .from('user_roles')
    .select('organization_id')
    .eq('user_id', userId);
  if (existing?.some((r: { organization_id: string | null }) => r.organization_id !== organizationId)) {
    throw apiError.forbidden('User belongs to another organization');
  }

  const { error: roleError } = await supabase
    .from('user_roles')
    .upsert({
      user_id: userId,
      role,
      organization_id: organizationId,
      assigned_by: user.id,
      updated_at: new Date().toISOString()
    });

  if (roleError) {
    console.error('[assign-role] upsert failed:', roleError);
    throw apiError.internal('Failed to assign role');
  }

  return success({ success: true }, `Role '${role}' assigned successfully`);
});
