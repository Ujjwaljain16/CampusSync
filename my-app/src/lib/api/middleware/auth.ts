import { NextRequest } from 'next/server'
import { createSupabaseServerClient, requireRole } from '@/lib/supabaseServer'
import { apiError } from '../utils/response'
import type { User } from '@supabase/supabase-js'

export type ApiHandler = (
  request: NextRequest,
  context: { user: User }
) => Promise<Response> | Response

export type ApiHandlerWithRole = (
  request: NextRequest,
  context: { user: User; role: string }
) => Promise<Response> | Response

/**
 * Middleware: Require user authentication
 * Wraps API route handlers to ensure user is authenticated
 * 
 * @example
 * ```ts
 * export const GET = withAuth(async (request, { user }) => {
 *   // user is guaranteed to exist here
 *   return success({ userId: user.id })
 * })
 * ```
 */
export function withAuth(
  handler: ApiHandler
): (request: NextRequest) => Promise<Response> {
  return async (request: NextRequest) => {
    try {
      const supabase = await createSupabaseServerClient()
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      
      if (authError || !user) {
        return apiError.unauthorized('Authentication required')
      }
      
      const result = await handler(request, { user })
      
      // If handler returns a Response, return it
      if (result instanceof Response) {
        return result
      }
      
      // Otherwise, something went wrong
      console.error('[withAuth] Handler did not return a Response:', result)
      return apiError.internal('Invalid response from handler')
    } catch (err) {
      console.error('[withAuth] Error:', err)
      
      // If the error is already a Response (from apiError), return it
      if (err instanceof Response) {
        return err
      }
      
      // Log the actual error message
      const errorMessage = err instanceof Error ? err.message : String(err)
      console.error('[withAuth] Error message:', errorMessage)
      
      return apiError.internal('Authentication error: ' + errorMessage)
    }
  }
}

/**
 * Middleware: Require specific role(s)
 * Wraps API route handlers to ensure user has required role
 * 
 * @example
 * ```ts
 * export const GET = withRole(['admin'], async (request, { user, role }) => {
 *   // user is admin here
 *   return success({ role })
 * })
 * ```
 */
export function withRole(
  allowedRoles: string[],
  handler: ApiHandlerWithRole
): (request: NextRequest) => Promise<Response> {
  return async (request: NextRequest) => {
    try {
      const auth = await requireRole(allowedRoles)
      
      if (!auth.authorized || !auth.user) {
        return apiError.forbidden(auth.message || 'Insufficient permissions')
      }
      
      return await handler(request, { 
        user: auth.user, 
        role: auth.role || 'student' 
      })
    } catch (err) {
      // If the error is already a Response (from apiError.throw), return it
      if (err instanceof Response) {
        return err
      }
      
      console.error('[withRole] Error:', err)
      const errorMessage = err instanceof Error ? err.message : String(err)
      return apiError.internal('Authorization error: ' + errorMessage)
    }
  }
}
