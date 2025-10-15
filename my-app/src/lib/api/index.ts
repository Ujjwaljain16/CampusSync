/**
 * API Utilities Index
 * Centralized exports for all API helpers, middleware, and utilities
 * 
 * Usage:
 * ```ts
 * import { withAuth, success, apiError } from '@/lib/api'
 * ```
 */

// Response utilities
export { success, error, apiError } from './utils/response'
export type { ApiSuccessResponse, ApiErrorResponse } from './utils/response'

// Validation utilities
export {
  parseAndValidateBody,
  validateSearchParams,
  isValidEmail,
  isValidUUID,
} from './utils/validation'

// Authentication middleware
export { withAuth, withRole } from './middleware/auth'
export type { ApiHandler, ApiHandlerWithRole } from './middleware/auth'

// Error handling middleware
export { withErrorHandler, compose } from './middleware/errorHandler'
export type { ErrorHandlerApiRoute } from './middleware/errorHandler'
