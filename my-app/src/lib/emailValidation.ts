// Email validation utilities for CampusSync
export interface ValidationResult {
  isValid: boolean;
  error?: string;
  domain?: string;
  isEducational?: boolean;
}

// Common educational domain patterns (fallback when the database is unavailable).
// Anchored to the END of the domain on a label boundary, so 'x.edu.evil.com' or
// 'university.evil.com' can never match. Matched against the domain only.
const FALLBACK_EDUCATIONAL_PATTERNS = [
  /^(?:[a-z0-9-]+\.)+edu$/,                       // .edu domains
  /^(?:[a-z0-9-]+\.)+edu\.[a-z]{2}$/,             // edu.<cc> (edu.au, edu.in, ...)
  /^(?:[a-z0-9-]+\.)+ac\.(?:uk|in|jp|au|nz|za)$/, // academic second-level domains
];

// Syntactically plausible hostname (labels of [a-z0-9-], at least two labels)
const DOMAIN_SHAPE = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

// Common non-educational domains to block
const BLOCKED_DOMAINS = [
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 
  'icloud.com', 'aol.com', 'protonmail.com', 'yandex.com',
  'rediffmail.com', 'mail.com', 'zoho.com'
];

// Extract domain from email
export function extractDomain(email: string): string {
  const trimmedEmail = email.trim().toLowerCase();
  const atIndex = trimmedEmail.lastIndexOf('@');
  return atIndex > 0 ? trimmedEmail.substring(atIndex + 1) : '';
}

// Check if domain is blocked
export function isBlockedDomain(email: string): boolean {
  const domain = extractDomain(email);
  return BLOCKED_DOMAINS.includes(domain);
}

// Check if domain matches educational patterns (fallback)
export function matchesEducationalPattern(email: string): boolean {
  const domain = extractDomain(email);
  if (!domain || !DOMAIN_SHAPE.test(domain)) return false;
  return FALLBACK_EDUCATIONAL_PATTERNS.some(pattern => pattern.test(domain));
}

/**
 * Does `domain` match an organization's allowed_email_domains entry?
 * - exact match:  'scaler.com'   allows 'scaler.com' only
 * - wildcard:     '*.scaler.com' allows 'sub.scaler.com' (not the apex, not 'evilscaler.com')
 * This is the ONE implementation used by signup, check-email and validate-email.
 */
export function domainMatchesAllowedEntry(domain: string, allowedEntry: string): boolean {
  const d = (domain ?? '').trim().toLowerCase();
  const p = (allowedEntry ?? '').trim().toLowerCase();
  if (!d || !p) return false;
  if (p.startsWith('*.')) {
    const base = p.slice(2);
    return !!base && d.length > base.length + 1 && d.endsWith('.' + base);
  }
  return d === p;
}

/** True if the domain matches ANY entry in an organization's allowed_email_domains. */
export function domainMatchesAllowedList(domain: string, allowedList: unknown): boolean {
  if (!Array.isArray(allowedList)) return false;
  return allowedList.some(
    (entry) => typeof entry === 'string' && domainMatchesAllowedEntry(domain, entry)
  );
}

/**
 * Match against a GLOBAL allowed_domains table entry (e.g. '.edu', 'ac.in').
 * Proper suffix match on a label boundary: 'x.edu' matches '.edu', but
 * 'x.edu.evil.com', 'notedu' and 'myedu' do not.
 */
export function domainMatchesGlobalPattern(domain: string, pattern: string): boolean {
  const d = (domain ?? '').trim().toLowerCase();
  const p = (pattern ?? '').trim().toLowerCase().replace(/^\*?\./, '');
  if (!d || !p) return false;
  return d === p || d.endsWith('.' + p);
}

// Validate email using database domains (preferred method)
export async function validateEmailWithDatabase(email: string): Promise<ValidationResult> {
  try {
    // Check both allowed_domains table AND organization-specific domains
    const response = await fetch('/api/auth/validate-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    
    if (!response.ok) {
      throw new Error('Failed to validate email');
    }
    
    const result = await response.json();
    
    if (result.isValid) {
      return { 
        isValid: true, 
        domain: result.domain, 
        isEducational: true 
      };
    }
    
    return { 
      isValid: false, 
      error: result.error || 'Please use a valid educational or institutional email address',
      domain: result.domain 
    };
  } catch {
    // Fallback to pattern matching if database is unavailable
    return validateEmailWithPatterns(email);
  }
}

// Validate email using patterns (fallback method)
export function validateEmailWithPatterns(email: string): ValidationResult {
  const domain = extractDomain(email);
  
  // Check if it's a blocked domain
  if (isBlockedDomain(email)) {
    return {
      isValid: false,
      error: 'Please use your institutional email address, not a personal email',
      domain
    };
  }
  
  // Check if it matches educational patterns
  if (matchesEducationalPattern(email)) {
    return { isValid: true, domain, isEducational: true };
  }
  
  return {
    isValid: false,
    error: 'Please use your institutional email address. If your institution is not onboarded, contact support.',
    domain
  };
}

// Main validation function (tries database first, falls back to patterns)
export async function validateStudentEmail(email: string): Promise<ValidationResult> {
  if (!email || !email.includes('@')) {
    return {
      isValid: false,
      error: 'Please enter a valid email address'
    };
  }
  
  // Try database validation first
  try {
    return await validateEmailWithDatabase(email);
  } catch {
    // Fallback to pattern validation
    return validateEmailWithPatterns(email);
  }
}

// Quick validation for client-side (pattern-based only)
export function validateStudentEmailSync(email: string): ValidationResult {
  return validateEmailWithPatterns(email);
}
