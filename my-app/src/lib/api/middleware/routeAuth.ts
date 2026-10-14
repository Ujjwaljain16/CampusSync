import { NextRequest } from 'next/server'
import type { User } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabaseServer'
import { apiError } from '../utils/response'
import { assertSuperAdmin, toErrorResponse } from '../utils/authorize'

/**
 * Wrappers for routes that need the authenticated user AND/OR Next.js dynamic
 * route params (e.g. /api/.../[orgId]/...). `withAuth` / `withRole` only
 * forward the request, so params would be lost.
 *
 *   export const GET  = withSession(async (req, { user }) => ...)                 // no params
 *   export const POST = withSession<{ id: string }>(async (req, { user, params }) => ...)
 *
 * - Authentication failure -> 401
 * - A thrown Response (apiError.*) is returned as-is
 * - Any other error -> generic 500 (details are logged, never returned)
 */

export interface SessionContext<P> {
  user: User
  params: P
}

export type SessionHandler<P> = (
  request: NextRequest,
  context: SessionContext<P>
) => Promise<Response> | Response

/** One-argument route when there are no params, Next.js route-context signature otherwise. */
export type SessionRoute<P> = [P] extends [never]
  ? (request: NextRequest) => Promise<Response>
  : (request: NextRequest, routeContext: { params: Promise<P> }) => Promise<Response>

export function withSession<P = never>(handler: SessionHandler<P>): SessionRoute<P> {
  const route = async (
    request: NextRequest,
    routeContext?: { params: Promise<P> }
  ): Promise<Response> => {
    try {
      const supabase = await createSupabaseServerClient()
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser()

      if (authError || !user) {
        return apiError.unauthorized('Authentication required')
      }

      const params = (routeContext?.params ? await routeContext.params : {}) as P
      return await handler(request, { user, params })
    } catch (err) {
      return toErrorResponse(err, 'withSession')
    }
  }
  return route as SessionRoute<P>
}

/** Like withSession, but the caller must hold an approved super_admin row. */
export function withSuperAdmin<P = never>(handler: SessionHandler<P>): SessionRoute<P> {
  return withSession<P>(async (request, context) => {
    await assertSuperAdmin(context.user)
    return handler(request, context)
  })
}
