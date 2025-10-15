import { NextRequest } from 'next/server'
import { apiError } from './response'

/**
 * Parse and validate JSON body from request
 * @param request - Next.js request object
 * @param requiredFields - Array of required field names
 * @returns Parsed body or error response
 */
export async function parseAndValidateBody<T = Record<string, unknown>>(
  request: NextRequest,
  requiredFields: string[] = []
): Promise<{ data: T; error: null } | { data: null; error: Response }> {
  try {
    const body = await request.json()
    
    if (!body || typeof body !== 'object') {
      return {
        data: null,
        error: apiError.badRequest('Invalid request body')
      }
    }
    
    // Check required fields
    const missing = requiredFields.filter(field => !(field in body))
    if (missing.length > 0) {
      return {
        data: null,
        error: apiError.validation(
          `Missing required fields: ${missing.join(', ')}`,
          { missingFields: missing }
        )
      }
    }
    
    return { data: body as T, error: null }
  } catch {
    return {
      data: null,
      error: apiError.badRequest('Invalid JSON body')
    }
  }
}

/**
 * Validate query parameters
 * @param request - Next.js request object
 * @param requiredParams - Array of required parameter names
 * @returns URLSearchParams or error response
 */
export function validateSearchParams(
  request: NextRequest,
  requiredParams: string[] = []
): { params: URLSearchParams; error: null } | { params: null; error: Response } {
  const { searchParams } = new URL(request.url)
  
  const missing = requiredParams.filter(param => !searchParams.has(param))
  if (missing.length > 0) {
    return {
      params: null,
      error: apiError.validation(
        `Missing required query parameters: ${missing.join(', ')}`,
        { missingParams: missing }
      )
    }
  }
  
  return { params: searchParams, error: null }
}

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

/**
 * Validate UUID format
 */
export function isValidUUID(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  return uuidRegex.test(uuid)
}
