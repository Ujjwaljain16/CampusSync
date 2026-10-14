import { NextRequest } from 'next/server';
import {
  withRole,
  isValidEmail,
  success,
  apiError,
  parseAndValidateBody,
  resolveAdminOrg,
  isKnownRole,
  checkRoleChange,
  findAuthUserByEmail,
  writeAudit,
} from '@/lib/api';
import { createSupabaseAdminClient } from '@/lib/supabaseServer';
import { getTargetRoleRow } from '@/lib/api/utils/roleIntegrity';
import { applyRoleChange } from '@/lib/api/utils/roleMutations';

interface InviteBody {
  email: string;
  role: string;
  organizationId?: string; // Optional: invite to specific organization
  organization_id?: string;
}

const PLACEHOLDER_TARGET = '00000000-0000-0000-0000-00000000ffff';

/**
 * POST /api/admin/invite
 *
 * Invite a person to ONE organization the caller administers.
 *  - caller must be admin-class in that organization and outrank the invited role
 *  - never touches a role row in any other organization
 *  - new members are recorded as `pending` until the invitation is accepted /
 *    approved (an invite must not create live privileges by itself)
 *  - an existing member of the organization gets a regular, guarded role change
 */
export const POST = withRole(['admin', 'org_admin', 'super_admin'], async (req: NextRequest, { user }) => {
  const result = await parseAndValidateBody<InviteBody>(req, ['email', 'role']);
  if (result.error) return result.error;

  const { role } = result.data;
  const requestedOrg = result.data.organizationId || result.data.organization_id || req.headers.get('X-Organization-ID');
  const email = typeof result.data.email === 'string' ? result.data.email.trim().toLowerCase() : '';

  if (!isKnownRole(role) || role === 'super_admin') {
    return apiError.badRequest('Invalid role');
  }
  if (!email || !isValidEmail(email)) {
    return apiError.badRequest('Invalid email');
  }

  const scope = await resolveAdminOrg(user, requestedOrg, 'admin');
  const orgId = scope.organizationId;

  // The caller must outrank the role being handed out
  const decision = checkRoleChange({
    actorRole: scope.role,
    actorId: user.id,
    targetUserId: PLACEHOLDER_TARGET,
    targetCurrentRole: null,
    newRole: role,
  });
  if (!decision.ok) return apiError.forbidden(decision.message);

  const adminSupabase = await createSupabaseAdminClient();

  let existingUser;
  try {
    existingUser = await findAuthUserByEmail(adminSupabase, email);
  } catch (err) {
    console.error('[admin/invite] user lookup failed:', err);
    return apiError.internal('Failed to look up user');
  }

  const now = new Date().toISOString();

  if (existingUser) {
    // ONLY the (user, this organization) row is considered. Rows in other
    // organizations are none of this admin's business and are never modified.
    const existingRow = await getTargetRoleRow(adminSupabase, existingUser.id, orgId);

    if (existingRow) {
      const change = await applyRoleChange(adminSupabase, {
        actorId: user.id,
        actorRole: scope.role,
        orgId,
        targetUserId: existingUser.id,
        newRole: role,
      });
      if (!change.ok) return change.response;

      await writeAudit(adminSupabase, {
        actorId: user.id,
        action: 'invite_role_update',
        targetType: 'user_role',
        targetId: existingUser.id,
        organizationId: orgId,
        details: { old_role: change.oldRole, new_role: role },
      });

      return success({
        message: `Role updated to '${role}' for existing member ${email}`,
        user_id: existingUser.id,
        organization_id: orgId,
        previous_role: change.oldRole,
      });
    }

    const { error: insertError } = await adminSupabase.from('user_roles').insert({
      user_id: existingUser.id,
      organization_id: orgId,
      role,
      approval_status: 'pending',
      assigned_by: user.id,
      created_at: now,
      updated_at: now,
    });
    if (insertError) {
      console.error('[admin/invite] pending role insert failed:', insertError);
      return apiError.internal('Failed to record the invitation');
    }

    await writeAudit(adminSupabase, {
      actorId: user.id,
      action: 'invite_existing_user',
      targetType: 'user_role',
      targetId: existingUser.id,
      organizationId: orgId,
      details: { role, status: 'pending' },
    });

    return success({
      message: `Invitation recorded for existing user ${email}; the '${role}' role is pending approval`,
      user_id: existingUser.id,
      organization_id: orgId,
      status: 'pending',
    });
  }

  // New person: send the invitation e-mail, record a PENDING role
  const { data: inviteData, error: inviteError } = await adminSupabase.auth.admin.inviteUserByEmail(email, {
    data: {
      invited_role: role,
      invited_by: user.id,
      organization_id: orgId,
    },
  });

  if (inviteError || !inviteData?.user?.id) {
    console.error('[admin/invite] invitation failed:', inviteError);
    return apiError.internal('Failed to send invitation');
  }

  const { error: roleError } = await adminSupabase.from('user_roles').insert({
    user_id: inviteData.user.id,
    organization_id: orgId,
    role,
    approval_status: 'pending',
    assigned_by: user.id,
    created_at: now,
    updated_at: now,
  });
  if (roleError) {
    console.error('[admin/invite] pending role insert failed:', roleError);
    return apiError.internal('Invitation sent but the role could not be recorded');
  }

  await writeAudit(adminSupabase, {
    actorId: user.id,
    action: 'invite_sent',
    targetType: 'user_role',
    targetId: inviteData.user.id,
    organizationId: orgId,
    details: { role, status: 'pending' },
  });

  return success(
    {
      message: `Invitation sent to ${email} with role '${role}' (pending acceptance)`,
      user_id: inviteData.user.id,
      organization_id: orgId,
      status: 'pending',
    },
    'Invitation sent successfully'
  );
});
