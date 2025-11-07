/**
 * Organization Context Middleware
 * 
 * Provides functions to get and enforce organization-scoped access.
 * Critical for preventing cross-tenant data leakage.
 */

import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { logger } from '@/lib/logger';

export interface OrganizationContext {
  userId: string;
  organizationId: string | null;
  role: string;
  isSuperAdmin: boolean;
}

/**
 * Get the organization context for a user.
 * 
 * @param userId - The user ID to get context for
 * @returns Organization context including role and organization ID
 * @throws Error if user role cannot be found
 */
export async function getOrganizationContext(userId: string): Promise<OrganizationContext> {
  const supabase = await createSupabaseServerClient();

  const { data: userRole, error } = await supabase
    .from('user_roles')
    .select('organization_id, role')
    .eq('user_id', userId)
    .single();

  if (error || !userRole) {
    logger.error('[ORG_CONTEXT] Failed to fetch organization context', { error: error?.message });
    throw new Error(`Failed to fetch organization context: ${error?.message || 'User role not found'}`);
  }

  const context: OrganizationContext = {
    userId,
    organizationId: userRole.organization_id,
    role: userRole.role,
    isSuperAdmin: userRole.role === 'super_admin'
  };

  logger.debug('[ORG_CONTEXT] Context retrieved', {
    userId: context.userId,
    role: context.role,
    organizationId: context.organizationId,
    isSuperAdmin: context.isSuperAdmin
  });

  return context;
}

/**
 * Enforce organization access for a specific organization.
 * 
 * Super admins can access any organization.
 * Regular users can only access their own organization.
 * 
 * @param userId - The user ID requesting access
 * @param requestedOrgId - The organization ID being accessed
 * @returns Object indicating if access is allowed and reason if not
 */
export async function enforceOrganizationAccess(
  userId: string,
  requestedOrgId: string
): Promise<{ allowed: boolean; reason?: string }> {
  try {
    const context = await getOrganizationContext(userId);

    // Super admins can access any organization (but must provide reason - see superAdminAccess middleware)
    if (context.isSuperAdmin) {
      logger.debug('[ORG_CONTEXT] Super admin access granted', { requestedOrgId });
      return { allowed: true };
    }

    // Regular users can only access their own organization
    if (context.organizationId !== requestedOrgId) {
      logger.warn('[ORG_CONTEXT] Cross-tenant access denied', {
        userId,
        userOrg: context.organizationId,
        requestedOrg: requestedOrgId
      });
      
      return {
        allowed: false,
        reason: `Access denied: You can only access data from your organization (${context.organizationId}). Requested: ${requestedOrgId}`
      };
    }

    logger.debug('[ORG_CONTEXT] Organization access granted', { requestedOrgId });
    return { allowed: true };
    
  } catch (error) {
    logger.error('[ORG_CONTEXT] Error enforcing organization access', { error: String(error) });
    return {
      allowed: false,
      reason: error instanceof Error ? error.message : 'Failed to verify organization access'
    };
  }
}

/**
 * Get organization filter for queries.
 * 
 * Returns null for super admins (can see all data).
 * Returns organization ID for regular users (scoped to their org).
 * 
 * @param userId - The user ID to get filter for
 * @returns Organization ID to filter by, or null for super admins
 */
export async function getOrganizationFilter(userId: string): Promise<string | null> {
  try {
    const context = await getOrganizationContext(userId);
    
    if (context.isSuperAdmin) {
      return null; // No filter - super admin sees all
    }
    
    if (!context.organizationId) {
      throw new Error('User has no organization context');
    }
    
    return context.organizationId;
  } catch (error) {
    console.error('[ORG_CONTEXT] Error getting organization filter:', error);
    throw error;
  }
}

/**
 * Validate that data array only contains items from user's organization.
 * 
 * Used as a second layer of defense in case API/RLS fails.
 * 
 * @param userId - The user ID performing validation
 * @param data - Array of data items to validate
 * @returns Filtered array containing only items from user's organization
 */
export async function validateOrganizationData<T extends { organization_id?: string }>(
  userId: string,
  data: T[]
): Promise<T[]> {
  try {
    const context = await getOrganizationContext(userId);
    
    // Super admins see all data
    if (context.isSuperAdmin) {
      return data;
    }
    
    // Filter out any data not matching user's organization
    const filtered = data.filter(item => 
      item.organization_id === context.organizationId
    );
    
    // Log warning if data was filtered (indicates API/RLS bypass attempt or bug)
    if (filtered.length !== data.length) {
      console.warn('[ORG_CONTEXT] [WARNING] Data filtering prevented cross-tenant leakage:', {
        userId,
        userOrg: context.organizationId,
        totalItems: data.length,
        filteredItems: filtered.length,
        removedItems: data.length - filtered.length
      });
      
      // In production, you might want to alert security team here
      if (process.env.NODE_ENV === 'production') {
        console.error('[SECURITY] CRITICAL: Cross-tenant data was returned by API/RLS but caught by validation layer');
      }
    }
    
    return filtered;
  } catch (error) {
    console.error('[ORG_CONTEXT] Error validating organization data:', error);
    // Fail closed - return empty array if we can't validate
    return [];
  }
}
