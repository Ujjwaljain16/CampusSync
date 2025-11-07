// Email validation utilities for CampusSync
export interface ValidationResult {
  isValid: boolean;
  error?: string;
  domain?: string;
  isEducational?: boolean;
}

// Common educational domain patterns (fallback when database is unavailable)
const FALLBACK_EDUCATIONAL_PATTERNS = [
  /\.edu$/,                    // .edu domains
  /\.ac\.uk$/,                 // UK universities
  /\.ac\.in$/,                 // Indian universities
  /\.ac\.jp$/,                 // Japanese universities
  /\.ac\.au$/,                 // Australian universities
  /\.ac\.nz$/,                 // New Zealand universities
  /\.ac\.za$/,                 // South African universities
  /university\./,              // Contains "university"
  /college\./,                 // Contains "college"
  /institute\./,               // Contains "institute"
  /school\./,                  // Contains "school"
  /campus\./,                  // Contains "campus"
  /\.edu\./,                   // .edu subdomains
];

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
  const trimmedEmail = email.trim().toLowerCase();
  return FALLBACK_EDUCATIONAL_PATTERNS.some(pattern => pattern.test(trimmedEmail));
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
