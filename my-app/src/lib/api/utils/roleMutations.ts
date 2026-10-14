/**
 * The one place that changes / creates / removes a user_roles row on behalf
 * of an admin. It must be called with the SERVICE-ROLE client, after the
 * caller was authorized with `authorizeOrg` / `resolveAdminOrg`.
 *
 * Enforced here (so no route can forget them):
 *  - exact (user_id, organization_id) targeting - never user_id alone
 *  - role hierarchy (actor must outrank both the target's old and new role)
 *  - no self-change / self-removal
 *  - primary admin is untouchable (use the v2 transfer flow)
 *  - the organization keeps at least one approved org_admin/admin
 *    (pre-check + post-verify with rollback; DB trigger drafted separately)
 *  - explicit organization_id and approval_status on every insert
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { apiError, error as errorResponse } from './response';
import { checkRoleChange, isAdminClass, ORG_ADMIN_ROLES } from './roles';
import {
  countOtherApprovedOrgAdmins,
  getTargetRoleRow,
  guardAdminLoss,
  type TargetRoleRow,
} from './roleIntegrity';

const NIL_UUID = '00000000-0000-0000-0000-000000000000';

export interface RoleChangeParams {
  actorId: string;
  /** Actor's highest role in the organization (from authorizeOrg). */
  actorRole: string;
  /** Organization of the row; null only for platform-level rows (super_admin only). */
  orgId: string | null;
  targetUserId: string;
  /** New role, or null to remove the row. */
  newRole: string | null;
}

export type RoleChangeResult =
  | { ok: true; oldRole: string | null; created: boolean; removed: boolean }
  | { ok: false; response: Response };

function fail(response: Response): RoleChangeResult {
  return { ok: false, response };
}

export async function applyRoleChange(
  admin: Pick<SupabaseClient, 'from'>,
  p: RoleChangeParams
): Promise<RoleChangeResult> {
  if (p.orgId === null && p.actorRole !== 'super_admin') {
    return fail(apiError.forbidden('Only a super admin can change platform-level roles'));
  }

  const target = await getTargetRoleRow(admin, p.targetUserId, p.orgId);

  const decision = checkRoleChange({
    actorRole: p.actorRole,
    actorId: p.actorId,
    targetUserId: p.targetUserId,
    targetCurrentRole: target?.role ?? null,
    newRole: p.newRole,
  });
  if (!decision.ok) {
    return fail(
      decision.status === 422 ? apiError.validation(decision.message) : apiError.forbidden(decision.message)
    );
  }

  // Super admins (founders) can never be demoted/removed through the API
  if (target?.role === 'super_admin' && p.newRole !== 'super_admin') {
    return fail(apiError.forbidden('CRITICAL: a super admin cannot be demoted or removed through this API'));
  }

  if (p.newRole === null && !target) {
    return fail(apiError.notFound('Role assignment not found'));
  }

  if (target) {
    const guard = await guardAdminLoss(admin, target, p.newRole);
    if (!guard.ok) return fail(guard.response);
  }

  const now = new Date().toISOString();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const scopeEq = (q: any) =>
    p.orgId === null ? q.is('organization_id', null) : q.eq('organization_id', p.orgId);

  // ---- removal -----------------------------------------------------------
  if (p.newRole === null) {
    const { data, error } = await scopeEq(
      admin.from('user_roles').delete().eq('user_id', p.targetUserId)
    ).select('user_id');
    if (error) {
      console.error('[roleMutations] delete failed:', error);
      return fail(apiError.internal('Failed to remove role'));
    }
    if (!data || data.length === 0) return fail(errorResponse('Role assignment changed concurrently', 409));
    if (await verifyOrgKeepsAdmin(admin, p.orgId, target, null)) {
      return fail(errorResponse('Cannot remove the last admin: the organization must keep at least one admin.', 409));
    }
    return { ok: true, oldRole: target!.role, created: false, removed: true };
  }

  // ---- update ------------------------------------------------------------
  if (target) {
    const { data, error } = await scopeEq(
      admin
        .from('user_roles')
        .update({
          role: p.newRole,
          approval_status: 'approved',
          assigned_by: p.actorId,
          updated_at: now,
        })
        .eq('user_id', p.targetUserId)
    ).select('user_id');
    if (error) {
      console.error('[roleMutations] update failed:', error);
      return fail(apiError.internal('Failed to update role'));
    }
    if (!data || data.length === 0) return fail(errorResponse('Role assignment changed concurrently', 409));

    const rolledBack = await verifyOrgKeepsAdmin(admin, p.orgId, target, p.newRole);
    if (rolledBack) {
      return fail(errorResponse('Cannot demote the last admin: the organization must keep at least one admin.', 409));
    }
    return { ok: true, oldRole: target.role, created: false, removed: false };
  }

  // ---- insert ------------------------------------------------------------
  const { error: insertError } = await admin.from('user_roles').insert({
    user_id: p.targetUserId,
    role: p.newRole,
    organization_id: p.orgId,
    approval_status: 'approved', // the actor outranks the new role (checked above)
    assigned_by: p.actorId,
    created_at: now,
    updated_at: now,
  });
  if (insertError) {
    if (insertError.code === '23503') return fail(apiError.notFound('User not found'));
    if (insertError.code === '23505') return fail(errorResponse('User already has a role in this organization', 409));
    console.error('[roleMutations] insert failed:', insertError);
    return fail(apiError.internal('Failed to assign role'));
  }
  return { ok: true, oldRole: null, created: true, removed: false };
}

/**
 * Post-condition: after demoting/removing an admin the org must still have
 * one. If a concurrent request raced the pre-check and left it adminless,
 * restore the previous row. Returns true when a rollback happened.
 */
async function verifyOrgKeepsAdmin(
  admin: Pick<SupabaseClient, 'from'>,
  orgId: string | null,
  before: TargetRoleRow | null,
  newRole: string | null
): Promise<boolean> {
  if (!orgId || !before) return false;
  const wasAdmin =
    before.approval_status === 'approved' && (ORG_ADMIN_ROLES as readonly string[]).includes(before.role);
  const staysAdmin = newRole !== null && isAdminClass(newRole) && newRole !== 'super_admin';
  if (!wasAdmin || staysAdmin) return false;

  const remaining = await countOtherApprovedOrgAdmins(admin, orgId, NIL_UUID);
  if (remaining > 0) return false;

  console.error('[roleMutations] org left without an admin by a concurrent change; restoring', {
    orgId,
    userId: before.user_id,
  });
  if (newRole === null) {
    await admin.from('user_roles').insert({
      user_id: before.user_id,
      role: before.role,
      organization_id: orgId,
      approval_status: before.approval_status ?? 'approved',
      is_primary_admin: before.is_primary_admin ?? false,
    });
  } else {
    await admin
      .from('user_roles')
      .update({ role: before.role, approval_status: before.approval_status ?? 'approved' })
      .eq('user_id', before.user_id)
      .eq('organization_id', orgId);
  }
  return true;
}
