import { NextRequest } from 'next/server'
import { apiError } from '../utils/response'

export type ErrorHandlerApiRoute = (
  request: NextRequest
) => Promise<Response> | Response

/**
 * Middleware: Global error handler
 * Catches and formats errors consistently
 * 
 * @example
 * ```ts
 * export const POST = withErrorHandler(async (request) => {
 *   // Any thrown errors are caught and formatted
 *   const data = await riskyOperation()
 *   return success(data)
 * })
 * ```
 */
export function withErrorHandler(
  handler: ErrorHandlerApiRoute
): (request: NextRequest) => Promise<Response> {
  return async (request: NextRequest) => {
    try {
      return await handler(request)
    } catch (err) {
      // Log the error for debugging
      console.error('[API Error]:', err)
      
      // Handle known error types
      if (err instanceof Error) {
        // Check for specific error patterns
        if (err.message.includes('JWT') || err.message.includes('token')) {
          return apiError.unauthorized('Invalid or expired token')
        }
        
        if (err.message.includes('not found')) {
          return apiError.notFound(err.message)
        }
        
        if (err.message.includes('duplicate') || err.message.includes('unique')) {
          return apiError.validation('Resource already exists', { error: err.message })
        }
        
        // Generic error response with message
        return apiError.internal(err.message)
      }
      
      // Unknown error type
      return apiError.internal('An unexpected error occurred')
    }
  }
}

/**
 * Combine multiple middleware functions
 * 
 * @example
 * ```ts
 * export const POST = compose(
 *   withErrorHandler,
 *   withAuth,
 *   async (request, { user }) => {
 *     return success({ user })
 *   }
 * )
 * ```
 */
export function compose<T extends ErrorHandlerApiRoute>(
  ...middlewares: ((handler: T) => T)[]
): (handler: T) => T {
  return (handler: T) => {
    return middlewares.reduceRight(
      (wrapped, middleware) => middleware(wrapped),
      handler
    )
  }
}
