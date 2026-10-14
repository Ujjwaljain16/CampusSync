/**
 * Server-side Supabase Client Utilities
 * Provides authenticated Supabase client instances for server-side operations
 */

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { User } from '@supabase/supabase-js'
import { isApprovedRow, isKnownRole, pickHighestRow, type RoleRow } from '@/lib/api/utils/roles'

/**
 * Create a Supabase client for server-side operations with user context
 * Uses cookies for authentication
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    }
  )
}

/**
 * Create a Supabase admin client with service role key
 * USE WITH CAUTION: Bypasses RLS policies
 */
export async function createSupabaseAdminClient() {
  // Use dynamic import for server-side only
  const { createClient } = await import('@supabase/supabase-js');
  
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  )
}

/**
 * Get authenticated user with role from server context
 * @returns User object with role and approval status or null if not authenticated
 */
export async function getServerUserWithRole(): Promise<{ 
  user: User; 
  role: string;
  approvalStatus?: string;
  organizationId?: string;
} | null> {
  const supabase = await createSupabaseServerClient()
  
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  
  if (authError || !user) {
    return null
  }
  
  // Fetch user roles (user may have multiple roles across orgs)
  // Deterministic: highest-privilege APPROVED row wins (ties: oldest first).
  // super_admin > org_admin > admin > faculty > recruiter > student
  const { data: roles, error: roleError } = await supabase
    .from('user_roles')
    .select('role, approval_status, organization_id, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })

  if (roleError) {
    console.error('[getServerUserWithRole] Error fetching roles:', roleError)
    return {
      user,
      role: 'student',
      approvalStatus: undefined,
      organizationId: undefined
    }
  }
  
  // If no roles, return student as default
  if (!roles || roles.length === 0) {
    return {
      user,
      role: 'student',
      approvalStatus: undefined,
      organizationId: undefined
    }
  }
  
  // Rank among APPROVED rows first, so a pending/denied high-privilege row can
  // never hide an approved lower one. Only when the user has no approved row do
  // we report the highest non-approved row (so callers can say "pending").
  const typedRoles = roles as RoleRow[];
  const approvedRoles = typedRoles.filter((r) => isKnownRole(r.role) && isApprovedRow(r));
  const highestRole =
    pickHighestRow(approvedRoles) ??
    pickHighestRow(typedRoles.filter((r) => isKnownRole(r.role))) ??
    typedRoles[0];

  return {
    user,
    role: highestRole.role || 'student',
    // A NULL status on an admin-class role is treated as not approved
    approvalStatus: highestRole.approval_status ?? (isApprovedRow(highestRole) ? undefined : 'pending'),
    organizationId: highestRole.organization_id ?? undefined
  }
}

/**
 * Require specific role for API access
 * @param allowedRoles Array of allowed roles
 * @returns User with role or throws error
 */
export async function requireRole(allowedRoles: string[]): Promise<{ 
  user: User; 
  role: string;
  authorized: boolean;
  message?: string;
}> {
  const result = await getServerUserWithRole()
  
  if (!result) {
    return {
      user: {} as User,
      role: 'student',
      authorized: false,
      message: 'Authentication required'
    }
  }
  
  // getServerUserWithRole already ranks approved rows first, so reaching a
  // non-approved status here means the user has NO approved role at all.
  // Pending / denied (or any unknown status) grants no privileges.
  if (result.approvalStatus && result.approvalStatus !== 'approved') {
    return {
      user: result.user,
      role: result.role,
      authorized: false,
      message: 'Your account is awaiting approval or access was denied'
    }
  }

  const isAuthorized = allowedRoles.includes(result.role)
  
  if (!isAuthorized) {
    return {
      user: result.user,
      role: result.role,
      authorized: false,
      message: `Access denied. Required roles: ${allowedRoles.join(', ')}. Current role: ${result.role}`
    }
  }
  
  return {
    user: result.user,
    role: result.role,
    authorized: true
  }
}
