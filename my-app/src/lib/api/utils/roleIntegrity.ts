/**
 * Role-integrity guards used by every route that changes or removes a
 * user_roles row. They run with the service-role client AFTER the caller has
 * been authorized with `authorizeOrg`, and always scope by organization_id.
 *
 * App-level guards are best effort (two concurrent requests can still race);
 * the matching database trigger is drafted in
 * supabase/migrations/20261014_authz_03_last_admin_trigger.sql.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { error as errorResponse } from './response';
import { ORG_ADMIN_ROLES, type RoleRow } from './roles';

export interface TargetRoleRow extends RoleRow {
  user_id: string;
}

type Db = Pick<SupabaseClient, 'from'>;

/** Exact (user, organization) row. Never queries by user_id alone. */
export async function getTargetRoleRow(
  db: Db,
  userId: string,
  orgId: string | null
): Promise<TargetRoleRow | null> {
  let q = db
    .from('user_roles')
    .select('user_id, role, organization_id, approval_status, created_at, is_primary_admin')
    .eq('user_id', userId);
  q = orgId === null ? q.is('organization_id', null) : q.eq('organization_id', orgId);
  const { data, error } = await q.limit(1);
  if (error) throw new Error(`getTargetRoleRow failed: ${error.message}`);
  const rows = (data ?? []) as TargetRoleRow[];
  return rows[0] ?? null;
}

/** Number of approved org_admin/admin rows in the org, excluding `excludeUserId`. */
export async function countOtherApprovedOrgAdmins(
  db: Db,
  orgId: string,
  excludeUserId: string
): Promise<number> {
  const { count, error } = await db
    .from('user_roles')
    .select('user_id', { count: 'exact', head: true })
    .eq('organization_id', orgId)
    .eq('approval_status', 'approved')
    .in('role', [...ORG_ADMIN_ROLES])
    .neq('user_id', excludeUserId);
  if (error) throw new Error(`countOtherApprovedOrgAdmins failed: ${error.message}`);
  return count ?? 0;
}

export type GuardResult = { ok: true } | { ok: false; response: Response };

/**
 * Guard for demoting or removing `target` from its organization.
 *  - the primary admin can only be changed through the v2 transfer flow
 *  - the organization must keep at least one other approved org_admin/admin
 *
 * `newRole` is the role the target will have afterwards (null when removed).
 */
export async function guardAdminLoss(
  db: Db,
  target: TargetRoleRow,
  newRole: string | null
): Promise<GuardResult> {
  const staysAdmin = newRole !== null && (ORG_ADMIN_ROLES as readonly string[]).includes(newRole);
  const wasAdmin =
    target.approval_status === 'approved' &&
    (ORG_ADMIN_ROLES as readonly string[]).includes(target.role);

  if (target.is_primary_admin && (newRole === null || newRole !== target.role)) {
    return {
      ok: false,
      response: errorResponse(
        'The primary admin cannot be demoted or removed. Transfer primary admin status first.',
        403
      ),
    };
  }

  if (wasAdmin && !staysAdmin && target.organization_id) {
    const others = await countOtherApprovedOrgAdmins(db, target.organization_id, target.user_id);
    if (others < 1) {
      return {
        ok: false,
        response: errorResponse(
          'Cannot remove or demote the last admin: the organization must keep at least one admin.',
          409
        ),
      };
    }
  }
  return { ok: true };
}
