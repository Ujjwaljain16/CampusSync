/**
 * Super Admin Access Validation Middleware
 * 
 * Enforces strict access reason requirements and rate limiting
 * for all super admin privileged actions.
 */

import { createSupabaseServerClient } from '@/lib/supabaseServer';

interface AccessValidationResult {
  allowed: boolean;
  reason?: string;
  warning?: string;
  rateLimitWarning?: boolean;
}

interface AccessRequest {
  userId: string;
  action: string;
  targetResource: string;
  accessReason: string;
  category?: 'debug' | 'support' | 'compliance' | 'security' | 'maintenance';
  metadata?: Record<string, unknown>;
}

// Rate limiting configuration
const RATE_LIMIT = {
  WINDOW_MINUTES: 60,
  MAX_ACTIONS: 50,
  WARNING_THRESHOLD: 40
};

// Trivial/invalid patterns to block
const INVALID_PATTERNS = [
  /^test/i,
  /^debug/i,
  /^checking/i,
  /^just\s+/i,
  /^n\/?a$/i,
  /^-+$/,
  /^\.+$/,
  /^x+$/i,
  /^[0-9]+$/,
  /^temp/i
];

/**
 * Validate access reason string.
 * 
 * Enforces:
 * - Minimum 20 characters
 * - No trivial patterns (test, debug, n/a, etc.)
 * - Must contain meaningful description
 */
function validateAccessReason(reason: string): { valid: boolean; error?: string } {
  // Minimum length check
  if (reason.length < 20) {
    return {
      valid: false,
      error: 'Access reason must be at least 20 characters long'
    };
  }

  // Check for trivial patterns
  for (const pattern of INVALID_PATTERNS) {
    if (pattern.test(reason)) {
      return {
        valid: false,
        error: `Access reason appears trivial or invalid. Please provide a meaningful explanation.`
      };
    }
  }

  // Check for meaningful content (not just repeated characters)
  const uniqueChars = new Set(reason.toLowerCase().replace(/\s/g, '')).size;
  if (uniqueChars < 5) {
    return {
      valid: false,
      error: 'Access reason must contain meaningful content'
    };
  }

  return { valid: true };
}

/**
 * Check rate limit for super admin actions.
 * 
 * Returns warning if approaching limit, error if exceeded.
 */
async function checkRateLimit(userId: string): Promise<{
  exceeded: boolean;
  count: number;
  warning?: boolean;
}> {
  const supabase = await createSupabaseServerClient();
  const windowStart = new Date(Date.now() - RATE_LIMIT.WINDOW_MINUTES * 60 * 1000);

  // Count super admin actions in the time window
  const { data: actions, error } = await supabase
    .from('super_admin_audit')
    .select('id')
    .eq('user_id', userId)
    .gte('created_at', windowStart.toISOString());

  if (error) {
    console.error('[RATE_LIMIT] Error checking rate limit:', error);
    // Fail open for non-critical errors (but log it)
    return { exceeded: false, count: 0 };
  }

  const count = actions?.length || 0;

  return {
    exceeded: count >= RATE_LIMIT.MAX_ACTIONS,
    count,
    warning: count >= RATE_LIMIT.WARNING_THRESHOLD
  };
}

/**
 * Log super admin access attempt to audit log.
 * 
 * CRITICAL: If logging fails, access is DENIED for security.
 */
async function logAccessAttempt(
  request: AccessRequest,
  allowed: boolean,
  ip?: string,
  userAgent?: string
): Promise<boolean> {
  try {
    const supabase = await createSupabaseServerClient();

    const { error } = await supabase
      .from('super_admin_audit')
      .insert({
        user_id: request.userId,
        action: request.action,
        target_resource: request.targetResource,
        access_reason: request.accessReason,
        category: request.category || 'maintenance',
        metadata: {
          ...request.metadata,
          ip_address: ip,
          user_agent: userAgent,
          allowed
        }
      });

    if (error) {
      console.error('[ACCESS_LOG] CRITICAL: Failed to log access attempt:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('[ACCESS_LOG] CRITICAL: Exception while logging:', error);
    return false;
  }
}

/**
 * Validate super admin access request.
 * 
 * This function should be called BEFORE performing any privileged action.
 * 
 * Usage:
 * ```typescript
 * const validation = await validateSuperAdminAccess({
 *   userId: user.id,
 *   action: 'delete_organization',
 *   targetResource: `organization:${orgId}`,
 *   accessReason: req.body.access_reason,
 *   category: 'maintenance',
 *   metadata: { organization_id: orgId }
 * });
 * 
 * if (!validation.allowed) {
 *   return NextResponse.json({ error: validation.reason }, { status: 403 });
 * }
 * ```
 */
export async function validateSuperAdminAccess(
  request: AccessRequest,
  ip?: string,
  userAgent?: string
): Promise<AccessValidationResult> {
  // Step 1: Validate access reason format
  const reasonValidation = validateAccessReason(request.accessReason);
  if (!reasonValidation.valid) {
    // Don't log invalid format attempts (could be user error)
    return {
      allowed: false,
      reason: reasonValidation.error
    };
  }

  // Step 2: Check rate limit
  const rateLimit = await checkRateLimit(request.userId);
  
  if (rateLimit.exceeded) {
    // Log rate limit violation
    await logAccessAttempt(request, false, ip, userAgent);
    
    return {
      allowed: false,
      reason: `Rate limit exceeded. Maximum ${RATE_LIMIT.MAX_ACTIONS} actions per ${RATE_LIMIT.WINDOW_MINUTES} minutes. Current: ${rateLimit.count}`,
    };
  }

  // Step 3: Log the access attempt
  const logged = await logAccessAttempt(request, true, ip, userAgent);
  
  if (!logged) {
    // CRITICAL: If we can't log the access, deny it for security
    console.error(
      '[ACCESS_VALIDATION] CRITICAL: Access denied - unable to log audit trail',
      `\n  User: ${request.userId}`,
      `\n  Action: ${request.action}`,
      `\n  Target: ${request.targetResource}`
    );
    
    return {
      allowed: false,
      reason: 'Access denied: Unable to record audit trail for security compliance'
    };
  }

  // Step 4: Return success with optional warning
  const result: AccessValidationResult = {
    allowed: true
  };

  if (rateLimit.warning) {
    result.rateLimitWarning = true;
    result.warning = `Approaching rate limit: ${rateLimit.count}/${RATE_LIMIT.MAX_ACTIONS} actions in last ${RATE_LIMIT.WINDOW_MINUTES} minutes`;
  }

  return result;
}

/**
 * Helper to extract request metadata for logging.
 */
export function getRequestMetadata(headers: Headers): { ip?: string; userAgent?: string } {
  return {
    ip: headers.get('x-forwarded-for') || headers.get('x-real-ip') || undefined,
    userAgent: headers.get('user-agent') || undefined
  };
}

/**
 * Validate category is one of allowed values.
 */
export function validateCategory(
  category?: string
): 'debug' | 'support' | 'compliance' | 'security' | 'maintenance' {
  const validCategories = ['debug', 'support', 'compliance', 'security', 'maintenance'];
  
  if (category && validCategories.includes(category)) {
    return category as 'debug' | 'support' | 'compliance' | 'security' | 'maintenance';
  }
  
  return 'maintenance';
}
