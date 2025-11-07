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

// Organization utilities
export {
  getOrganizationContext,
  getRequestedOrgId,
  getUserAccessibleOrganizations,
  isSuperAdmin,
  isOrgAdmin,
  isRecruiterContext,
  getTargetOrganizationIds,
} from './utils/organization'
export type { OrganizationContext, RecruiterContext } from './utils/organization'

// Recruiter utilities
export {
  getRecruiterContext,
  getRecruiterOrganizations,
  hasRecruiterAccess,
  getRequestedOrgId as getRecruiterRequestedOrgId,
} from './utils/recruiter'

// Authentication middleware
export { withAuth, withRole } from './middleware/auth'
export type { ApiHandler, ApiHandlerWithRole } from './middleware/auth'

// Error handling middleware
export { withErrorHandler, compose } from './middleware/errorHandler'
export type { ErrorHandlerApiRoute } from './middleware/errorHandler'
