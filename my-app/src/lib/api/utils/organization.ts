/**
 * Organization Context Utilities
 * Helper functions for multi-organization features in API routes
 */

import { createSupabaseServerClient } from '@/lib/supabaseServer';
import type { User } from '@supabase/supabase-js';
import { apiError } from './response';
import { getRecruiterContext, type RecruiterContext } from './recruiter';

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

  // Get user's roles first to check what type of user they are
  const { data: userRoles, error: rolesError } = await supabase
    .from('user_roles')
    .select('role, organization_id')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true });

  if (rolesError || !userRoles || userRoles.length === 0) {
    throw apiError.forbidden('User is not assigned to any organization');
  }

  const primaryRole = userRoles[0];

  // [NEW] HANDLE RECRUITER - NULL organization_id, use recruiter multi-org system
  if (primaryRole.role === 'recruiter' && primaryRole.organization_id === null) {
    return await getRecruiterContext(user, requestedOrgId);
  }

  // [NEW] HANDLE SUPER ADMIN - NULL organization_id, can access all orgs
  if (primaryRole.role === 'super_admin' && primaryRole.organization_id === null) {
    // If a specific org is requested, allow it (super admin can access any org)
    if (requestedOrgId) {
      // Verify org exists
      const { data: org } = await supabase
        .from('organizations')
        .select('id')
        .eq('id', requestedOrgId)
        .single();

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

    // For super admin without requested org, return first available org or throw error
    const { data: firstOrg } = await supabase
      .from('organizations')
      .select('id')
      .eq('is_active', true)
      .order('created_at', { ascending: true })
      .limit(1)
      .single();

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

  // Regular user with organization_id - standard flow
  // If a specific organization is requested, verify user has access
  if (requestedOrgId) {
    const { data: userRole, error } = await supabase
      .from('user_roles')
      .select('role, organization_id')
      .eq('user_id', user.id)
      .eq('organization_id', requestedOrgId)
      .single();

    if (error || !userRole) {
      throw apiError.forbidden('You do not have access to this organization');
    }

    return {
      organizationId: requestedOrgId,
      role: userRole.role,
      isSuperAdmin: userRole.role === 'super_admin',
      isOrgAdmin: ['org_admin', 'super_admin', 'admin'].includes(userRole.role),
      isRecruiter: false,
    };
  }

  // Check if user is a super admin (from their roles)
  const isSuperAdmin = userRoles.some(r => r.role === 'super_admin');

  return {
    organizationId: primaryRole.organization_id,
    role: primaryRole.role,
    isSuperAdmin,
    isOrgAdmin: ['org_admin', 'super_admin', 'admin'].includes(primaryRole.role),
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
 * Verify user has access to multiple organizations (for super admins)
 * Useful for admin endpoints that need to query across organizations
 * 
 * @param user - The authenticated user
 * @returns Array of organization IDs the user can access
 */
export async function getUserAccessibleOrganizations(user: User): Promise<string[]> {
  const supabase = await createSupabaseServerClient();

  const { data: userRoles, error } = await supabase
    .from('user_roles')
    .select('organization_id, role')
    .eq('user_id', user.id);

  if (error || !userRoles || userRoles.length === 0) {
    return [];
  }

  // If super admin, they can access all organizations
  const isSuperAdmin = userRoles.some(r => r.role === 'super_admin');
  
  if (isSuperAdmin) {
    // Fetch all organization IDs
    const { data: allOrgs } = await supabase
      .from('organizations')
      .select('id')
      .eq('is_active', true);

    return (allOrgs || []).map(org => org.id);
  }

  // Otherwise, return only the organizations they belong to
  return userRoles.map(r => r.organization_id);
}

/**
 * Check if user is a super admin
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
    .single();

  return !!data;
}

/**
 * Check if user is an org admin for a specific organization
 * @param user - The authenticated user
 * @param organizationId - The organization ID to check
 * @returns boolean
 */
export async function isOrgAdmin(user: User, organizationId: string): Promise<boolean> {
  const supabase = await createSupabaseServerClient();

  const { data } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .eq('organization_id', organizationId)
    .in('role', ['org_admin', 'super_admin', 'admin'])
    .single();

  return !!data;
}
