/**
 * Role hierarchy helpers (pure functions, no I/O).
 *
 * user_roles.role is constrained in the database to:
 *   student | faculty | recruiter | admin | org_admin | super_admin
 *
 * The rank table is the single source of truth for "who outranks whom".
 * Everything that decides whether an actor may grant / revoke / modify a role
 * must go through these helpers instead of ad-hoc string comparisons.
 */

export const ROLE_RANK: Readonly<Record<string, number>> = Object.freeze({
  super_admin: 100,
  org_admin: 80,
  admin: 60,
  faculty: 40,
  recruiter: 20,
  student: 10,
});

export const VALID_ROLES: readonly string[] = Object.freeze(Object.keys(ROLE_RANK));
export const ADMIN_CLASS_ROLES: readonly string[] = Object.freeze(['super_admin', 'org_admin', 'admin']);
/** Roles that administer a single organization (super_admin is platform-wide). */
export const ORG_ADMIN_ROLES: readonly string[] = Object.freeze(['org_admin', 'admin']);

/** Minimal shape of a user_roles row used by the authorization helpers. */
export interface RoleRow {
  role: string;
  organization_id: string | null;
  approval_status?: string | null;
  created_at?: string | null;
  is_primary_admin?: boolean | null;
}

export function isKnownRole(role: unknown): role is string {
  return typeof role === 'string' && Object.prototype.hasOwnProperty.call(ROLE_RANK, role);
}

/** Rank of a role; unknown roles rank 0 so they never outrank anything. */
export function rankOf(role: string | null | undefined): number {
  if (!role || !isKnownRole(role)) return 0;
  return ROLE_RANK[role];
}

export function isAdminClass(role: string | null | undefined): boolean {
  return !!role && ADMIN_CLASS_ROLES.includes(role);
}

/**
 * A row only grants privileges when it has been approved.
 * Legacy rows with a NULL approval_status are tolerated for non-admin roles
 * only; admin-class roles must be explicitly 'approved'.
 */
export function isApprovedRow(row: Pick<RoleRow, 'role' | 'approval_status'>): boolean {
  if (row.approval_status === 'approved') return true;
  if (row.approval_status == null) return !isAdminClass(row.role);
  return false;
}

/** Strict variant: explicitly 'approved' only (use for authorization of admin actions). */
export function isStrictlyApproved(row: Pick<RoleRow, 'approval_status'>): boolean {
  return row.approval_status === 'approved';
}

/**
 * Highest-privilege row. Ties are broken by created_at ascending (oldest wins),
 * then by input order, so the result is deterministic.
 */
export function pickHighestRow<T extends RoleRow>(rows: readonly T[]): T | undefined {
  let best: T | undefined;
  for (const row of rows) {
    if (!best) {
      best = row;
      continue;
    }
    const diff = rankOf(row.role) - rankOf(best.role);
    if (diff > 0) {
      best = row;
    } else if (diff === 0) {
      const a = row.created_at ?? '';
      const b = best.created_at ?? '';
      if (a && b && a < b) best = row;
    }
  }
  return best;
}

export type RoleChangeDecision =
  | { ok: true }
  | { ok: false; status: 403 | 422; message: string };

export interface RoleChangeInput {
  actorRole: string;
  actorId: string;
  targetUserId: string;
  /** Target's current role in the org, or null when the target has no row there. */
  targetCurrentRole: string | null;
  /** New role, or null when the role row is being removed. */
  newRole: string | null;
}

/**
 * Hierarchy rules for granting / changing / revoking a role:
 *  - the role must be a known role
 *  - nobody changes or removes their own role
 *  - super_admin may do anything else
 *  - otherwise actorRank must be strictly greater than the target's current
 *    rank AND strictly greater than the new rank. So an `admin` can never
 *    touch admin/org_admin/super_admin, and an `org_admin` can grant `admin`
 *    but never `org_admin`. super_admin is only assignable by a super_admin.
 */
export function checkRoleChange(input: RoleChangeInput): RoleChangeDecision {
  const { actorRole, actorId, targetUserId, targetCurrentRole, newRole } = input;

  if (newRole !== null && !isKnownRole(newRole)) {
    return { ok: false, status: 422, message: 'Invalid role' };
  }
  if (actorId === targetUserId) {
    return {
      ok: false,
      status: 403,
      message: newRole === null ? 'You cannot remove your own role' : 'You cannot change your own role',
    };
  }
  if (actorRole === 'super_admin') return { ok: true };

  const actorRank = rankOf(actorRole);
  if (targetCurrentRole && rankOf(targetCurrentRole) >= actorRank) {
    return {
      ok: false,
      status: 403,
      message: `Your role (${actorRole}) is not high enough to modify a ${targetCurrentRole}`,
    };
  }
  if (newRole !== null && rankOf(newRole) >= actorRank) {
    return {
      ok: false,
      status: 403,
      message: `Your role (${actorRole}) is not high enough to grant ${newRole}`,
    };
  }
  return { ok: true };
}
