/**
 * Server-side Supabase Client Utilities
 * Provides authenticated Supabase client instances for server-side operations
 */

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { User } from '@supabase/supabase-js'

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
  // Prioritize: super_admin > org_admin > admin > faculty/recruiter > student
  const roleHierarchy = ['super_admin', 'org_admin', 'admin', 'faculty', 'recruiter', 'student'];
  
  const { data: roles, error: roleError } = await supabase
    .from('user_roles')
    .select('role, approval_status, organization_id')
    .eq('user_id', user.id)
  
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
  
  // Find the highest priority role
  let highestRole = roles[0];
  for (const role of roles) {
    const currentIndex = roleHierarchy.indexOf(role.role);
    const highestIndex = roleHierarchy.indexOf(highestRole.role);
    if (currentIndex !== -1 && (highestIndex === -1 || currentIndex < highestIndex)) {
      highestRole = role;
    }
  }
  
  return {
    user,
    role: highestRole.role || 'student',
    approvalStatus: highestRole.approval_status,
    organizationId: highestRole.organization_id
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
