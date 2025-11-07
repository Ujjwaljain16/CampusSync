/**
 * Recruiter Context Utilities
 * Helper functions for recruiter multi-organization access
 */

import { createSupabaseServerClient } from '@/lib/supabaseServer';
import type { User } from '@supabase/supabase-js';
import { apiError } from './response';

export interface RecruiterContext {
  role: 'recruiter';
  accessibleOrganizations: string[];
  selectedOrganization: string | null;
  isRecruiter: true;
  isSuperAdmin: false;
}

/**
 * Get recruiter's multi-org context
 * 
 * @param user - Authenticated user
 * @param requestedOrgId - Optional org ID from X-Organization-ID header
 * @returns RecruiterContext with accessible orgs
 * @throws 403 if user is not a recruiter or doesn't have access to requested org
 * 
 * @example
 * ```ts
 * // Get context with org selection
 * const requestedOrgId = req.headers.get('X-Organization-ID');
 * const recruiterContext = await getRecruiterContext(user, requestedOrgId);
 * 
 * // Query for specific org
 * if (recruiterContext.selectedOrganization) {
 *   await supabase.from('students')
 *     .eq('organization_id', recruiterContext.selectedOrganization);
 * }
 * 
 * // Query all accessible orgs
 * await supabase.from('students')
 *   .in('organization_id', recruiterContext.accessibleOrganizations);
 * ```
 */
export async function getRecruiterContext(
  user: User,
  requestedOrgId?: string | null
): Promise<RecruiterContext> {
  const supabase = await createSupabaseServerClient();

  // 1. Verify user is a recruiter with NULL organization_id
  const { data: recruiterRole, error: roleError } = await supabase
    .from('user_roles')
    .select('role, organization_id')
    .eq('user_id', user.id)
    .is('organization_id', null)
    .eq('role', 'recruiter')
    .single();

  if (roleError || !recruiterRole) {
    throw apiError.forbidden('User is not a recruiter');
  }

  // 2. Get all approved organization-specific access from user_roles
  const { data: accessOrgs, error: accessError } = await supabase
    .from('user_roles')
    .select('organization_id')
    .eq('user_id', user.id)
    .eq('role', 'recruiter')
    .eq('approval_status', 'approved')
    .not('organization_id', 'is', null); // Only org-specific entries

  if (accessError) {
    console.error('Error fetching accessible orgs:', accessError);
    throw apiError.internal('Failed to fetch accessible organizations');
  }

  const accessibleOrgIds = (accessOrgs || [])
    .map((o: { organization_id: string | null }) => o.organization_id)
    .filter((id): id is string => id !== null);

  // 3. If organization requested, verify access
  if (requestedOrgId) {
    if (!accessibleOrgIds.includes(requestedOrgId)) {
      throw apiError.forbidden(
        'You do not have access to this organization. Request access first.'
      );
    }
  }

  return {
    role: 'recruiter',
    accessibleOrganizations: accessibleOrgIds,
    selectedOrganization: requestedOrgId || null,
    isRecruiter: true,
    isSuperAdmin: false,
  };
}

/**
 * Get list of organizations a recruiter has access to with full details
 * 
 * @param userId - User ID
 * @returns Array of organizations with access status
 */
export async function getRecruiterOrganizations(userId: string) {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from('recruiter_org_access')
    .select(`
      organization_id,
      status,
      requested_at,
      approved_at,
      organizations!inner (
        id,
        name,
        domain,
        website
      )
    `)
    .eq('recruiter_user_id', userId)
    .order('approved_at', { ascending: false });

  if (error) {
    console.error('Error fetching recruiter organizations:', error);
    throw apiError.internal('Failed to fetch organizations');
  }

  return data;
}

/**
 * Extract requested organization ID from request headers or body
 * 
 * @param request - NextRequest
 * @returns organization_id or null
 */
export function getRequestedOrgId(request: Request): string | null {
  // Check X-Organization-ID header
  const headerOrgId = request.headers.get('X-Organization-ID');
  if (headerOrgId) return headerOrgId;

  return null;
}

/**
 * Helper to validate recruiter has access to organization
 * 
 * @param userId - User ID
 * @param organizationId - Organization ID to check
 * @returns boolean
 */
export async function hasRecruiterAccess(
  userId: string,
  organizationId: string
): Promise<boolean> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from('recruiter_org_access')
    .select('id')
    .eq('recruiter_user_id', userId)
    .eq('organization_id', organizationId)
    .eq('status', 'approved')
    .single();

  return !error && !!data;
}
