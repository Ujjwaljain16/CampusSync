/**
 * Runtime Environment Validation
 * Used in API routes and middleware to ensure environment is properly configured
 */

import { features, config, getFeatureStatus, isProduction } from './envValidator';
import { logger } from './logger';

export interface HealthCheckResult {
  healthy: boolean;
  environment: string;
  timestamp: string;
  checks: {
    name: string;
    status: 'pass' | 'fail' | 'warn';
    message: string;
    critical: boolean;
  }[];
  features: {
    name: string;
    enabled: boolean;
    required: boolean;
  }[];
}

/**
 * Perform comprehensive health check
 */
export function performHealthCheck(): HealthCheckResult {
  const checks: HealthCheckResult['checks'] = [];
  const featureList: HealthCheckResult['features'] = [];

  // Critical checks
  try {
    config.getSupabaseConfig();
    checks.push({
      name: 'Supabase Configuration',
      status: 'pass',
      message: 'Supabase is properly configured',
      critical: true,
    });
  } catch (error) {
    checks.push({
      name: 'Supabase Configuration',
      status: 'fail',
      message: error instanceof Error ? error.message : 'Configuration error',
      critical: true,
    });
  }

  // Gemini API check
  if (features.hasGeminiApi()) {
    checks.push({
      name: 'Gemini API',
      status: 'pass',
      message: 'Gemini API key is configured',
      critical: true,
    });
  } else {
    checks.push({
      name: 'Gemini API',
      status: 'fail',
      message: 'GEMINI_API_KEY is not set - OCR will fail',
      critical: true,
    });
  }

  // VC Issuer JWK check
  try {
    const jwk = config.getVcIssuerJwk();
    if (jwk) {
      checks.push({
        name: 'VC Issuer JWK',
        status: 'pass',
        message: 'Verifiable Credential issuer key is configured',
        critical: true,
      });
    } else if (!isProduction()) {
      checks.push({
        name: 'VC Issuer JWK',
        status: 'warn',
        message: 'Using development fallback key (not for production)',
        critical: true,
      });
    }
  } catch (error) {
    checks.push({
      name: 'VC Issuer JWK',
      status: 'fail',
      message: error instanceof Error ? error.message : 'Invalid JWK',
      critical: true,
    });
  }

  // Optional features
  featureList.push(
    {
      name: 'Email Notifications',
      enabled: features.isEmailEnabled(),
      required: false,
    },
    {
      name: 'OCR Processing',
      enabled: features.isOcrEnabled(),
      required: false,
    },
    {
      name: 'Documents Table',
      enabled: features.isDocumentsTableEnabled(),
      required: false,
    },
    {
      name: 'External OCR Service',
      enabled: features.hasExternalOcrService(),
      required: false,
    }
  );

  // Email configuration check
  if (features.isEmailEnabled()) {
    checks.push({
      name: 'Email Service',
      status: 'pass',
      message: 'SMTP is configured',
      critical: false,
    });
  } else {
    checks.push({
      name: 'Email Service',
      status: 'warn',
      message: 'Email notifications disabled - SMTP not configured',
      critical: false,
    });
  }

  // Production-specific checks
  if (isProduction()) {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_SITE_URL;
    if (baseUrl?.includes('localhost')) {
      checks.push({
        name: 'Production URL Configuration',
        status: 'fail',
        message: 'Base URL contains localhost in production environment',
        critical: true,
      });
    } else {
      checks.push({
        name: 'Production URL Configuration',
        status: 'pass',
        message: 'Production URLs properly configured',
        critical: true,
      });
    }
  }

  const healthy = checks.filter(c => c.critical && c.status === 'fail').length === 0;

  return {
    healthy,
    environment: process.env.NODE_ENV || 'unknown',
    timestamp: new Date().toISOString(),
    checks,
    features: featureList,
  };
}

/**
 * Assert that critical features are available
 * Throws error if any critical feature is missing
 */
export function assertCriticalFeatures(): void {
  const healthCheck = performHealthCheck();
  
  const criticalFailures = healthCheck.checks.filter(
    c => c.critical && c.status === 'fail'
  );

  if (criticalFailures.length > 0) {
    const errorMessage = [
      'Critical environment configuration failures:',
      ...criticalFailures.map(f => `  [ERROR] ${f.name}: ${f.message}`),
    ].join('\n');

    logger.error('Environment validation failed', { 
      failures: criticalFailures,
      environment: process.env.NODE_ENV 
    });

    throw new Error(errorMessage);
  }

  // Log warnings
  const warnings = healthCheck.checks.filter(c => c.status === 'warn');
  if (warnings.length > 0) {
    logger.warn('Environment configuration warnings', {
      warnings: warnings.map(w => ({ name: w.name, message: w.message }))
    });
  }
}

/**
 * Get degraded feature message for user-facing errors
 */
export function getDegradedFeatureMessage(feature: string): string {
  const messages: Record<string, string> = {
    email: 'Email notifications are currently unavailable. Please check back later.',
    ocr: 'Document processing is currently unavailable. Please try uploading your certificate later.',
    externalOcr: 'Using built-in OCR service. Processing may be slower than usual.',
  };

  return messages[feature] || 'This feature is temporarily unavailable.';
}

/**
 * Safe feature execution with fallback
 */
export async function executeWithFallback<T>(
  feature: string,
  primaryFn: () => Promise<T>,
  fallbackFn: () => Promise<T>,
  options: { required?: boolean } = {}
): Promise<T> {
  const isEnabled = isFeatureAvailable(feature);

  if (!isEnabled) {
    if (options.required) {
      throw new Error(`Required feature '${feature}' is not available`);
    }
    logger.warn(`Feature '${feature}' not available, using fallback`);
    return fallbackFn();
  }

  try {
    return await primaryFn();
  } catch (error) {
    logger.error(`Feature '${feature}' failed, using fallback`, error);
    return fallbackFn();
  }
}

/**
 * Check if a feature is available
 */
function isFeatureAvailable(feature: string): boolean {
  const featureMap: Record<string, () => boolean> = {
    email: features.isEmailEnabled,
    ocr: features.isOcrEnabled,
    gemini: features.hasGeminiApi,
    externalOcr: features.hasExternalOcrService,
    documentsTable: features.isDocumentsTableEnabled,
  };

  const checkFn = featureMap[feature];
  return checkFn ? checkFn() : false;
}

/**
 * Log environment status on startup
 */
export function logEnvironmentStatus(): void {
  const status = getFeatureStatus();
  
  logger.debug('Environment Status', {
    environment: process.env.NODE_ENV,
    critical: status.critical,
    optional: status.optional,
    config: status.config,
  });

  // Log warnings for missing optional features
  if (!status.optional.email) {
    logger.warn('Email notifications disabled - SMTP not configured');
  }

  if (!status.critical.geminiApi) {
    logger.error('CRITICAL: Gemini API not configured - OCR will fail');
  }
}
