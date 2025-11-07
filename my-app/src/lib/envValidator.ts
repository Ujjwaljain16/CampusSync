/**
 * Environment Variable Validator
 * Ensures all required environment variables are set before the app starts
 * Prevents runtime errors due to missing configuration
 */

export const requiredEnvVars = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'NEXT_PUBLIC_SITE_URL',
  'NEXT_PUBLIC_ISSUER_DID',
  'NEXT_PUBLIC_ISSUER_VERIFICATION_METHOD',
] as const;

export const requiredServerEnvVars = [
  'SUPABASE_SERVICE_ROLE_KEY',
  'VC_ISSUER_JWK',
  'GEMINI_API_KEY',
] as const;

export const optionalEnvVars = [
  'NEXT_PUBLIC_BASE_URL', // Can fallback to NEXT_PUBLIC_SITE_URL
  'GEMINI_MODEL', // Has default: gemini-2.5-flash
  'USE_DOCUMENTS_TABLE', // Has default: true
  'OCR_ENABLED', // Has default: true
  'OCR_SERVICE_URL', // Optional OCR service
  'SMTP_HOST', // Optional email service
  'SMTP_PORT',
  'SMTP_USER',
  'SMTP_PASS',
] as const;

export interface ValidationResult {
  valid: boolean;
  missing: string[];
  warnings: string[];
}

/**
 * Validate public environment variables (safe for client-side)
 */
export function validatePublicEnv(): ValidationResult {
  if (typeof window !== 'undefined') {
    // Skip server-side validation in browser
    return { valid: true, missing: [], warnings: [] };
  }

  const missing: string[] = [];
  const warnings: string[] = [];

  // Check required public variables
  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      missing.push(envVar);
    }
  }

  // Check for common misconfigurations
  if (process.env.NEXT_PUBLIC_SITE_URL?.includes('localhost') && process.env.NODE_ENV === 'production') {
    warnings.push('[WARNING] NEXT_PUBLIC_SITE_URL is set to localhost in production environment');
  }

  if (process.env.NEXT_PUBLIC_ISSUER_DID?.includes('localhost') && process.env.NODE_ENV === 'production') {
    warnings.push('[WARNING] NEXT_PUBLIC_ISSUER_DID contains localhost in production environment');
  }

  return {
    valid: missing.length === 0,
    missing,
    warnings,
  };
}

/**
 * Validate server-only environment variables
 */
export function validateServerEnv(): ValidationResult {
  if (typeof window !== 'undefined') {
    // Never run server validation in browser
    return { valid: true, missing: [], warnings: [] };
  }

  const missing: string[] = [];
  const warnings: string[] = [];

  // Check required server variables
  for (const envVar of requiredServerEnvVars) {
    if (!process.env[envVar]) {
      missing.push(envVar);
    }
  }

  // Validate JWK format
  if (process.env.VC_ISSUER_JWK) {
    try {
      const jwk = JSON.parse(process.env.VC_ISSUER_JWK);
      if (!jwk.kty || !jwk.alg) {
        warnings.push('[WARNING] VC_ISSUER_JWK is not a valid JWK format');
      }
    } catch {
      warnings.push('[WARNING] VC_ISSUER_JWK is not valid JSON');
    }
  }

  // Check SMTP configuration (all or nothing)
  const smtpVars = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS'];
  const smtpSet = smtpVars.filter(v => process.env[v]);
  if (smtpSet.length > 0 && smtpSet.length < smtpVars.length) {
    warnings.push(`[WARNING] Partial SMTP configuration detected. Set all of: ${smtpVars.join(', ')}`);
  }

  return {
    valid: missing.length === 0,
    missing,
    warnings,
  };
}

/**
 * Validate all environment variables
 * Throws error if required variables are missing
 */
export function validateEnv(): void {
  if (typeof window !== 'undefined') {
    // Never validate in browser
    return;
  }

  console.log('[INFO] Validating environment configuration...\n');

  // Validate public env
  const publicResult = validatePublicEnv();
  
  // Validate server env
  const serverResult = validateServerEnv();

  // Combine results
  const allMissing = [...publicResult.missing, ...serverResult.missing];
  const allWarnings = [...publicResult.warnings, ...serverResult.warnings];

  // Display results
  if (allMissing.length > 0) {
    console.error('[ERROR] Missing required environment variables:\n');
    allMissing.forEach(v => console.error(`   - ${v}`));
    console.error('\n[INFO] Copy .env.example to .env.local and fill in the values\n');
    
    if (process.env.NODE_ENV === 'production') {
      throw new Error(`Missing ${allMissing.length} required environment variable(s)`);
    } else {
      console.error('[WARNING] Starting in development mode with missing variables (will fail in production)\n');
    }
  }

  if (allWarnings.length > 0) {
    console.warn('[WARNING] Environment configuration warnings:\n');
    allWarnings.forEach(w => console.warn(`   ${w}`));
    console.warn('');
  }

  if (allMissing.length === 0 && allWarnings.length === 0) {
    console.log('[SUCCESS] All required environment variables are set');
    
    // Display optional variables status
    const optionalSet = optionalEnvVars.filter(v => process.env[v]);
    if (optionalSet.length > 0) {
      console.log(`[INFO] Optional features enabled: ${optionalSet.join(', ')}`);
    }
    console.log('');
  }
}

/**
 * Get environment-aware URLs (helper function)
 */
export function getBaseUrl(): string {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_SITE_URL;
  
  if (!baseUrl) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('NEXT_PUBLIC_BASE_URL or NEXT_PUBLIC_SITE_URL must be set in production');
    }
    // Development fallback
    return 'http://localhost:3000';
  }

  return baseUrl;
}

/**
 * Get issuer DID (helper function)
 */
export function getIssuerDID(): string {
  const issuerDid = process.env.NEXT_PUBLIC_ISSUER_DID;
  
  if (!issuerDid) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('NEXT_PUBLIC_ISSUER_DID must be set in production');
    }
    // Development fallback
    return 'did:web:localhost:3000';
  }

  return issuerDid;
}

/**
 * Check if running in production
 */
export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

/**
 * Check if running in development
 */
export function isDevelopment(): boolean {
  return process.env.NODE_ENV === 'development';
}

/**
 * Check if running in test
 */
export function isTest(): boolean {
  return process.env.NODE_ENV === 'test';
}

/**
 * Feature flags with graceful degradation
 */
export const features = {
  /**
   * Check if OCR is enabled
   */
  isOcrEnabled(): boolean {
    const enabled = process.env.OCR_ENABLED?.toLowerCase();
    return enabled !== 'false' && enabled !== '0'; // Default: true
  },

  /**
   * Check if email notifications are enabled
   */
  isEmailEnabled(): boolean {
    return !!(
      process.env.SMTP_HOST &&
      process.env.SMTP_PORT &&
      process.env.SMTP_USER &&
      process.env.SMTP_PASS
    );
  },

  /**
   * Check if documents table is enabled
   */
  isDocumentsTableEnabled(): boolean {
    const enabled = process.env.USE_DOCUMENTS_TABLE?.toLowerCase();
    return enabled !== 'false' && enabled !== '0'; // Default: true
  },

  /**
   * Check if external OCR service is configured
   */
  hasExternalOcrService(): boolean {
    return !!process.env.OCR_SERVICE_URL;
  },

  /**
   * Check if Gemini API is available
   */
  hasGeminiApi(): boolean {
    return !!process.env.GEMINI_API_KEY;
  },

  /**
   * Check if all critical features are available
   */
  isCriticalFeaturesAvailable(): boolean {
    return this.hasGeminiApi(); // Gemini is critical for OCR
  },
};

/**
 * Get configuration with safe defaults
 */
export const config = {
  /**
   * Get Gemini model name
   */
  getGeminiModel(): string {
    return process.env.GEMINI_MODEL || 'gemini-2.0-flash-exp';
  },

  /**
   * Get OCR service URL (if external service is used)
   */
  getOcrServiceUrl(): string | null {
    return process.env.OCR_SERVICE_URL || null;
  },

  /**
   * Get SMTP configuration
   */
  getSmtpConfig(): {
    host: string;
    port: number;
    user: string;
    pass: string;
  } | null {
    if (!features.isEmailEnabled()) {
      return null;
    }
    
    return {
      host: process.env.SMTP_HOST!,
      port: parseInt(process.env.SMTP_PORT!, 10),
      user: process.env.SMTP_USER!,
      pass: process.env.SMTP_PASS!,
    };
  },

  /**
   * Get Supabase configuration
   */
  getSupabaseConfig(): {
    url: string;
    anonKey: string;
    serviceRoleKey: string | null;
  } {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !anonKey) {
      if (isProduction()) {
        throw new Error('Supabase configuration is required in production');
      }
      throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY');
    }

    return {
      url,
      anonKey,
      serviceRoleKey: serviceRoleKey || null,
    };
  },

  /**
   * Get VC Issuer JWK
   */
  getVcIssuerJwk(): object | null {
    const jwkString = process.env.VC_ISSUER_JWK;
    
    if (!jwkString) {
      if (isProduction()) {
        throw new Error('VC_ISSUER_JWK is required in production');
      }
      return null; // Development will use fallback key
    }

    try {
      return JSON.parse(jwkString);
    } catch (error) {
      throw new Error(`VC_ISSUER_JWK is not valid JSON: ${error}`);
    }
  },

  /**
   * Get verification method
   */
  getVerificationMethod(): string {
    const method = process.env.NEXT_PUBLIC_ISSUER_VERIFICATION_METHOD;
    
    if (!method) {
      if (isProduction()) {
        throw new Error('NEXT_PUBLIC_ISSUER_VERIFICATION_METHOD is required in production');
      }
      // Development fallback
      return `${getIssuerDID()}#key-1`;
    }

    return method;
  },
};

/**
 * Runtime environment check - call this in middleware or API routes
 */
export function assertProductionReady(): void {
  if (!isProduction()) {
    return; // Skip in development
  }

  const errors: string[] = [];

  // Check all required variables
  [...requiredEnvVars, ...requiredServerEnvVars].forEach(varName => {
    if (!process.env[varName]) {
      errors.push(`Missing required env var: ${varName}`);
    }
  });

  // Check for localhost in production
  if (process.env.NEXT_PUBLIC_SITE_URL?.includes('localhost')) {
    errors.push('NEXT_PUBLIC_SITE_URL cannot contain localhost in production');
  }

  if (process.env.NEXT_PUBLIC_ISSUER_DID?.includes('localhost')) {
    errors.push('NEXT_PUBLIC_ISSUER_DID cannot contain localhost in production');
  }

  // Check critical features
  if (!features.hasGeminiApi()) {
    errors.push('GEMINI_API_KEY is required for OCR functionality');
  }

  if (errors.length > 0) {
    throw new Error(
      `Production environment is not ready:\n${errors.map(e => `  - ${e}`).join('\n')}`
    );
  }
}

/**
 * Get feature availability status (for debugging)
 */
export function getFeatureStatus(): {
  critical: Record<string, boolean>;
  optional: Record<string, boolean>;
  config: Record<string, string | null>;
} {
  return {
    critical: {
      supabase: !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      serviceRoleKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      geminiApi: features.hasGeminiApi(),
      vcIssuerJwk: !!process.env.VC_ISSUER_JWK,
      siteUrl: !!process.env.NEXT_PUBLIC_SITE_URL,
      issuerDid: !!process.env.NEXT_PUBLIC_ISSUER_DID,
    },
    optional: {
      email: features.isEmailEnabled(),
      externalOcr: features.hasExternalOcrService(),
      documentsTable: features.isDocumentsTableEnabled(),
      ocr: features.isOcrEnabled(),
    },
    config: {
      baseUrl: getBaseUrl(),
      issuerDid: getIssuerDID(),
      geminiModel: config.getGeminiModel(),
      nodeEnv: process.env.NODE_ENV || 'development',
    },
  };
}

/**
 * Safe getter for environment variables with fallback
 */
export function getEnv(key: string, fallback?: string): string {
  const value = process.env[key];
  
  if (!value) {
    if (fallback !== undefined) {
      return fallback;
    }
    
    if (isProduction()) {
      throw new Error(`Required environment variable ${key} is not set`);
    }
    
    throw new Error(`Environment variable ${key} is not set. Provide a fallback or set the variable.`);
  }
  
  return value;
}

/**
 * Safe getter for optional environment variables
 */
export function getOptionalEnv(key: string, fallback: string = ''): string {
  return process.env[key] || fallback;
}

/**
 * Check if a specific feature should be enabled
 */
export function isFeatureEnabled(feature: string): boolean {
  const value = process.env[`FEATURE_${feature.toUpperCase()}`];
  return value === 'true' || value === '1';
}

