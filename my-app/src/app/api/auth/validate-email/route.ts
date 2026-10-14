import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabaseServer';
import { enforceRateLimit } from '@/lib/rateLimit';
import {
  extractDomain,
  domainMatchesAllowedList,
  domainMatchesGlobalPattern,
} from '@/lib/emailValidation';

/**
 * POST /api/auth/validate-email
 *
 * Validates if an email domain is allowed based on:
 * 1. Organization-specific allowed_email_domains (exact domain, or `*.domain` wildcard)
 * 2. Global allowed_domains table (proper suffix match on a label boundary)
 *
 * This is a PUBLIC endpoint, so it only answers "valid or not" for the domain
 * the caller typed. It does not return organization ids/names/slugs; the signup
 * UI that needs the list of matching organizations uses /api/auth/check-email.
 */
export async function POST(request: NextRequest) {
  const limited = enforceRateLimit(request, 'validate-email', { interval: 60 * 1000, uniqueTokenPerInterval: 20 });
  if (limited) return limited;

  try {
    const { email } = await request.json();

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return NextResponse.json({
        isValid: false,
        error: 'Please enter a valid email address',
        domain: null
      }, { status: 400 });
    }

    const domain = extractDomain(email);

    if (!domain) {
      return NextResponse.json({
        isValid: false,
        error: 'Invalid email format',
        domain: null
      }, { status: 400 });
    }

    // Use admin client to bypass RLS for public validation
    // This is a PUBLIC endpoint that MUST work without authentication
    const supabase = await createSupabaseAdminClient();

    // Step 1: organization-specific allowed domains (exact / wildcard)
    const { data: allOrgs, error: orgError } = await supabase
      .from('organizations')
      .select('id, settings')
      .eq('is_active', true);

    if (orgError) {
      console.error('[Email Validation] Error fetching organizations:', orgError.message);
    } else {
      const orgMatch = (allOrgs || []).some((org: { settings?: { allowed_email_domains?: unknown } }) =>
        domainMatchesAllowedList(domain, org.settings?.allowed_email_domains)
      );

      if (orgMatch) {
        return NextResponse.json({ isValid: true, domain });
      }
    }

    // Step 2: global allowed_domains table for general educational patterns
    const { data: allowedDomains, error: domainError } = await supabase
      .from('allowed_domains')
      .select('domain')
      .eq('is_active', true);

    if (domainError) {
      console.error('[Email Validation] Error fetching global domains:', domainError.message);
    } else if (allowedDomains && allowedDomains.length > 0) {
      const isAllowed = allowedDomains.some((d: { domain: string }) =>
        typeof d.domain === 'string' && domainMatchesGlobalPattern(domain, d.domain)
      );

      if (isAllowed) {
        return NextResponse.json({ isValid: true, domain });
      }
    }

    // Step 3: No match found - reject
    return NextResponse.json({
      isValid: false,
      error: 'Please use your institutional email address. If your institution is not yet onboarded, contact support.',
      domain
    });

  } catch (error) {
    console.error('Email validation error:', error instanceof Error ? error.message : 'unknown');
    return NextResponse.json({
      isValid: false,
      error: 'Unable to validate email. Please try again.',
      domain: null
    }, { status: 500 });
  }
}
