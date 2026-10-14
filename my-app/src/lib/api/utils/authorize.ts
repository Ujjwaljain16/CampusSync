/**
 * Organization-scoped authorization.
 *
 * `requireRole` / `withRole` answer "does this user hold role X *somewhere*".
 * That is NOT enough for multi-tenant admin actions: an admin of org A who is
 * merely a student in org B must not administer org B. `authorizeOrg` answers
 * the right question: "does this user hold an APPROVED role of sufficient
 * privilege in THIS organization".
 *
 * All helpers throw an `apiError.*` Response (never an Error with a raw DB
 * message). Handlers wrapped with withAuth / withRole / withSession convert a
 * thrown Response into the HTTP response.
 */

import type { SupabaseClient, User } from '@supabase/supabase-js';
import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { apiError } from './response';
import { isUuid } from './validation';
import { getOrganizationContext, isRecruiterContext } from './organization';
import {
  isKnownRole,
  pickHighestRow,
  rankOf,
  type RoleRow,
} from './roles';

export interface UserRoleRecord extends RoleRow {
  user_id?: string;
}

export interface OrgAuthorization {
  ok: true;
  /** Highest approved role the user holds in the organization (super_admin if platform admin). */
  role: string;
  rank: number;
  organizationId: string;
  isSuperAdmin: boolean;
  /** Approved rows that granted access (rows in the org, plus super_admin rows). */
  rows: UserRoleRecord[];
}

export interface AuthorizeOrgOptions {
  orgId: string;
  /** Minimum role (by rank) required, e.g. 'admin'. */
  minRole?: string;
  /** Alternatively, an explicit allow-list: any approved role in the org that is listed passes. */
  roles?: readonly string[];
  /** Client used to read user_roles (defaults to the cookie-bound server client). */
  client?: SupabaseClient;
}

type UserLike = Pick<User, 'id'>;

/**
 * Fetch every approved user_roles row of a user, oldest first.
 * No `.single()`: a user may hold several rows.
 */
export async function fetchApprovedRoleRows(
  userId: string,
  client?: SupabaseClient
): Promise<UserRoleRecord[]> {
  const supabase = client ?? ((await createSupabaseServerClient()) as unknown as SupabaseClient);
  const { data, error } = await supabase
    .from('user_roles')
    .select('role, organization_id, approval_status, created_at, is_primary_admin')
    .eq('user_id', userId)
    .eq('approval_status', 'approved')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[authorizeOrg] Failed to read user_roles:', error);
    throw apiError.internal('Failed to verify permissions');
  }
  // Defence in depth: never trust the filter alone.
  return ((data ?? []) as UserRoleRecord[]).filter(
    (r) => r.approval_status === 'approved' && isKnownRole(r.role)
  );
}

/**
 * Authorize `user` for `orgId`.
 *
 *  - super_admin (any approved super_admin row) passes for every organization
 *  - otherwise the user needs an approved row with organization_id = orgId
 *    whose role satisfies `minRole` / `roles`
 *  - pending / denied rows never count
 *  - several rows in the same org are fine; the highest-privilege row decides
 *
 * @throws apiError.badRequest for a malformed orgId, apiError.forbidden otherwise
 */
export async function authorizeOrg(
  user: UserLike,
  opts: AuthorizeOrgOptions
): Promise<OrgAuthorization> {
  const { orgId, minRole, roles } = opts;

  if (typeof orgId !== 'string' || !isUuid(orgId)) {
    throw apiError.badRequest('Invalid organization id');
  }

  const approved = await fetchApprovedRoleRows(user.id, opts.client);

  const superRows = approved.filter((r) => r.role === 'super_admin');
  const orgRows = approved.filter((r) => r.organization_id === orgId);
  const rows = [...superRows, ...orgRows];

  if (rows.length === 0) {
    throw apiError.forbidden('You do not have access to this organization');
  }

  const best = pickHighestRow(rows)!;
  const isSuperAdmin = superRows.length > 0;

  if (!isSuperAdmin) {
    if (minRole && rankOf(best.role) < rankOf(minRole)) {
      throw apiError.forbidden('Insufficient permissions for this organization');
    }
    if (roles && !rows.some((r) => roles.includes(r.role))) {
      throw apiError.forbidden('Insufficient permissions for this organization');
    }
  }

  return {
    ok: true,
    role: best.role,
    rank: rankOf(best.role),
    organizationId: orgId,
    isSuperAdmin,
    rows,
  };
}

/**
 * Resolve + authorize the organization an admin action applies to.
 *
 *  - `requestedOrgId` given (header / body / query): caller must hold >= minRole
 *    IN THAT ORG (or be super_admin).
 *  - not given: the caller's default org (highest-privilege approved row) is
 *    used and must satisfy minRole. A super_admin without a requested org gets
 *    `requested: false` so list endpoints can choose to span all orgs.
 */
export async function resolveAdminOrg(
  user: User,
  requestedOrgId: string | null | undefined,
  minRole: string = 'admin',
  client?: SupabaseClient
): Promise<OrgAuthorization & { requested: boolean }> {
  if (requestedOrgId) {
    const auth = await authorizeOrg(user, { orgId: requestedOrgId, minRole, client });
    return { ...auth, requested: true };
  }

  const ctx = await getOrganizationContext(user);
  if (isRecruiterContext(ctx)) {
    throw apiError.forbidden('Recruiters cannot perform organization admin actions');
  }
  const auth = await authorizeOrg(user, { orgId: ctx.organizationId, minRole, client });
  return { ...auth, requested: false };
}

/**
 * Platform-level check: caller must hold an approved super_admin row.
 * Works for super admins that also hold other rows (no `.single()`).
 */
export async function assertSuperAdmin(
  user: UserLike,
  client?: SupabaseClient
): Promise<void> {
  const approved = await fetchApprovedRoleRows(user.id, client);
  if (!approved.some((r) => r.role === 'super_admin')) {
    throw apiError.forbidden('Super admin access required');
  }
}

/** Convert anything thrown by a handler into a Response without leaking internals. */
export function toErrorResponse(err: unknown, tag = 'API'): Response {
  if (err instanceof Response) return err;
  console.error(`[${tag}] Unexpected error:`, err);
  return apiError.internal('Internal server error');
}
