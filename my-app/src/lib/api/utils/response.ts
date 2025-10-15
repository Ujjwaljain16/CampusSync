import { NextResponse } from 'next/server'

/**
 * Standardized API response utilities
 * Provides consistent response format across all API routes
 */

export interface ApiSuccessResponse<T = unknown> {
  data: T
  message?: string
}

export interface ApiErrorResponse {
  error: string
  details?: unknown
}

/**
 * Success response helper
 * @param data - The data to return
 * @param message - Optional success message
 * @param status - HTTP status code (default: 200)
 */
export function success<T>(
  data: T,
  message?: string,
  status = 200
): NextResponse<ApiSuccessResponse<T>> {
  const response: ApiSuccessResponse<T> = { data }
  if (message) response.message = message
  return NextResponse.json(response, { status })
}

/**
 * Error response helper
 * @param message - Error message
 * @param status - HTTP status code (default: 500)
 * @param details - Optional error details
 */
export function error(
  message: string,
  status = 500,
  details?: unknown
): NextResponse<ApiErrorResponse> {
  const response: ApiErrorResponse = { error: message }
  if (details) response.details = details
  return NextResponse.json(response, { status })
}

/**
 * Common error responses
 */
export const apiError = {
  /** 401 Unauthorized */
  unauthorized: (message = 'Unauthorized') => 
    error(message, 401),
  
  /** 403 Forbidden */
  forbidden: (message = 'Forbidden') => 
    error(message, 403),
  
  /** 404 Not Found */
  notFound: (message = 'Resource not found') => 
    error(message, 404),
  
  /** 400 Bad Request */
  badRequest: (message = 'Bad request', details?: unknown) => 
    error(message, 400, details),
  
  /** 500 Internal Server Error */
  internal: (message = 'Internal server error', details?: unknown) => 
    error(message, 500, details),
  
  /** 422 Validation Error */
  validation: (message: string, details?: unknown) => 
    error(message, 422, details),
}
