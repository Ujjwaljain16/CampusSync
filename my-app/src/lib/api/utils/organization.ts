/**
 * Organization Context Utilities
 * Helper functions for multi-organization features in API routes
 */

import { createSupabaseServerClient } from '@/lib/supabaseServer';
import type { User } from '@supabase/supabase-js';
import { apiError } from './response';
import { getRecruiterContext, type RecruiterContext } from './recruiter';
import { isUuid } from './validation';
import {
  isApprovedRow,
  isKnownRole,
  pickHighestRow,
  ORG_ADMIN_ROLES,
  type RoleRow,
} from './roles';

export interface OrganizationContext {
  organizationId: string;
  role: string;
  isSuperAdmin: boolean;
  isOrgAdmin: boolean;
  isRecruiter?: boolean;
}

// Export RecruiterContext for use in API routes
export type { RecruiterContext };

/**
 * Type guard to check if context is RecruiterContext
 */
export function isRecruiterContext(context: OrganizationContext | RecruiterContext): context is RecruiterContext {
  return 'isRecruiter' in context && context.isRecruiter === true;
}

/**
 * Helper to get organization IDs from any context type
 * For regular users: returns single org ID in array
 * For recruiters: returns all accessible org IDs or selected org
 *
 * @param context - Organization or Recruiter context
 * @returns Array of organization IDs to query
 */
export function getTargetOrganizationIds(context: OrganizationContext | RecruiterContext): string[] {
  if (isRecruiterContext(context)) {
    return context.selectedOrganization
      ? [context.selectedOrganization]
      : context.accessibleOrganizations;
  }
  return [context.organizationId];
}

/**
 * Get the user's current organization context
 * This should be called in every multi-tenant API route
 *
 * FOR RECRUITERS: Use this function - it will automatically detect and handle recruiter multi-org access
 *
 * Resolution rules (deterministic):
 *  - Only APPROVED user_roles rows count. Pending / denied rows are ignored.
 *  - super_admin (any approved super_admin row) -> may use any organization.
 *  - With `requestedOrgId`: the user must hold an approved row IN THAT ORG; the
 *    role reported is the highest-privilege approved role they hold there
 *    (several rows are fine). `isOrgAdmin` is computed from that role, so an
 *    admin of org A who is a student in org B is NOT an org admin for B.
 *  - Without `requestedOrgId`: the highest-privilege approved row wins
 *    (ties: oldest created_at). It is no longer "whichever row was created first".
 *
 * NOTE: this does not enforce a minimum role. For admin-only actions call
 * `authorizeOrg` (or check `isOrgAdmin` of the returned context).
 *
 * @param user - The authenticated user from withAuth/withRole
 * @param requestedOrgId - Optional: specific org ID from request params/body or X-Organization-ID header
 * @returns Organization context with role information (or RecruiterContext for recruiters)
 *
 * @example
 * ```ts
 * export const GET = withAuth(async (request, { user }) => {
 *   const requestedOrgId = request.headers.get('X-Organization-ID');
 *   const orgContext = await getOrganizationContext(user, requestedOrgId);
 *
 *   // For recruiters with multi-org access, check if it's a RecruiterContext
 *   if ('isRecruiter' in orgContext && orgContext.isRecruiter) {
 *     // Handle recruiter with multiple orgs
 *     if (orgContext.selectedOrganization) {
 *       // Query specific org
 *     } else {
 *       // Query all accessible orgs
 *       query.in('organization_id', orgContext.accessibleOrganizations);
 *     }
 *   } else {
 *     // Regular user with single org
 *     query.eq('organization_id', orgContext.organizationId);
 *   }
 * });
 * ```
 */
export async function getOrganizationContext(
  user: User,
  requestedOrgId?: string | null
): Promise<OrganizationContext | RecruiterContext> {
  const supabase = await createSupabaseServerClient();

  // All of the user's rows (a user may hold several), oldest first
  const { data: userRoles, error: rolesError } = await supabase
    .from('user_roles')
    .select('role, organization_id, approval_status, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true });

  if (rolesError || !userRoles || userRoles.length === 0) {
    throw apiError.forbidden('User is not assigned to any organization');
  }

  // Only APPROVED rows grant anything. Pending / denied rows are ignored.
  const approved = (userRoles as RoleRow[]).filter(
    (r) => isKnownRole(r.role) && isApprovedRow(r)
  );
  if (approved.length === 0) {
    throw apiError.forbidden('Your access is awaiting approval or was denied');
  }

  // SUPER ADMIN - can access every organization
  if (approved.some((r) => r.role === 'super_admin')) {
    if (requestedOrgId) {
      if (!isUuid(requestedOrgId)) throw apiError.badRequest('Invalid organization id');
      const { data: org } = await supabase
        .from('organizations')
        .select('id')
        .eq('id', requestedOrgId)
        .maybeSingle();

      if (!org) {
        throw apiError.notFound('Organization not found');
      }

      return {
        organizationId: requestedOrgId,
        role: 'super_admin',
        isSuperAdmin: true,
        isOrgAdmin: true,
        isRecruiter: false,
      };
    }

    // No org requested: fall back to the first active org
    const { data: firstOrg } = await supabase
      .from('organizations')
      .select('id')
      .eq('is_active', true)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!firstOrg) {
      throw apiError.notFound('No organizations available. Please specify organization ID via X-Organization-ID header.');
    }

    return {
      organizationId: firstOrg.id,
      role: 'super_admin',
      isSuperAdmin: true,
      isOrgAdmin: true,
      isRecruiter: false,
    };
  }

  // RECRUITER - platform-level (NULL org) row + per-org access rows
  const hasPlatformRecruiterRow = approved.some(
    (r) => r.role === 'recruiter' && r.organization_id === null
  );

  if (requestedOrgId) {
    if (!isUuid(requestedOrgId)) throw apiError.badRequest('Invalid organization id');

    const best = pickHighestRow(approved.filter((r) => r.organization_id === requestedOrgId));

    if (!best || best.role === 'recruiter') {
      // Recruiters go through the multi-org recruiter system (throws 403 without access)
      if (hasPlatformRecruiterRow) {
        return await getRecruiterContext(user, requestedOrgId);
      }
    }
    if (!best) {
      throw apiError.forbidden('You do not have access to this organization');
    }

    return {
      organizationId: requestedOrgId,
      role: best.role,
      isSuperAdmin: false,
      isOrgAdmin: ORG_ADMIN_ROLES.includes(best.role),
      isRecruiter: false,
    };
  }

  // No org requested: deterministic - highest-privilege approved row, ties by created_at
  const best = pickHighestRow(approved)!;

  if (best.role === 'recruiter' && hasPlatformRecruiterRow) {
    return await getRecruiterContext(user, requestedOrgId);
  }

  if (!best.organization_id) {
    throw apiError.forbidden('User is not assigned to any organization');
  }

  return {
    organizationId: best.organization_id,
    role: best.role,
    isSuperAdmin: false,
    isOrgAdmin: ORG_ADMIN_ROLES.includes(best.role),
    isRecruiter: false,
  };
}

/**
 * Get organization ID from request headers or body
 * Checks X-Organization-ID header first, then falls back to body
 *
 * @param request - NextRequest object
 * @returns Organization ID if found, undefined otherwise
 */
export async function getRequestedOrgId(request: Request): Promise<string | undefined> {
  // Check header first
  const headerOrgId = request.headers.get('X-Organization-ID');
  if (headerOrgId) return headerOrgId;

  // Try to read from body (only for POST/PATCH/PUT)
  if (['POST', 'PATCH', 'PUT'].includes(request.method)) {
    try {
      const body = await request.clone().json();
      return body.organization_id;
    } catch {
      // Body parsing failed or no organization_id
      return undefined;
    }
  }

  return undefined;
}

/**
 * Organizations the user can act in (approved rows only).
 * Super admins can access every active organization.
 *
 * @param user - The authenticated user
 * @returns Array of organization IDs the user can access
 */
export async function getUserAccessibleOrganizations(user: User): Promise<string[]> {
  const supabase = await createSupabaseServerClient();

  const { data: userRoles, error } = await supabase
    .from('user_roles')
    .select('organization_id, role, approval_status')
    .eq('user_id', user.id);

  if (error || !userRoles || userRoles.length === 0) {
    return [];
  }

  const approved = (userRoles as RoleRow[]).filter((r) => isKnownRole(r.role) && isApprovedRow(r));

  // If super admin, they can access all organizations
  if (approved.some((r) => r.role === 'super_admin')) {
    const { data: allOrgs } = await supabase
      .from('organizations')
      .select('id')
      .eq('is_active', true);

    return (allOrgs || []).map(org => org.id);
  }

  // Otherwise, return only the organizations they belong to (no NULLs, no duplicates)
  return [...new Set(approved.map((r) => r.organization_id).filter((id): id is string => !!id))];
}

/**
 * Check if user is a super admin (approved super_admin row, any number of rows)
 * @param user - The authenticated user
 * @returns boolean
 */
export async function isSuperAdmin(user: User): Promise<boolean> {
  const supabase = await createSupabaseServerClient();

  const { data } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .eq('role', 'super_admin')
    .eq('approval_status', 'approved')
    .limit(1);

  return !!data && data.length > 0;
}

/**
 * Check if user is an (approved) org admin for a specific organization.
 * Super admins are admins of every organization.
 * @param user - The authenticated user
 * @param organizationId - The organization ID to check
 * @returns boolean
 */
export async function isOrgAdmin(user: User, organizationId: string): Promise<boolean> {
  const supabase = await createSupabaseServerClient();

  const { data } = await supabase
    .from('user_roles')
    .select('role, organization_id')
    .eq('user_id', user.id)
    .eq('approval_status', 'approved')
    .in('role', ['org_admin', 'super_admin', 'admin']);

  return (data ?? []).some(
    (r: { role: string; organization_id: string | null }) =>
      r.role === 'super_admin' || r.organization_id === organizationId
  );
}
