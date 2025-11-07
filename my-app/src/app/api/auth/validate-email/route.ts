import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabaseServer';

/**
 * POST /api/auth/validate-email
 * 
 * Validates if an email domain is allowed based on:
 * 1. Organization-specific allowed_email_domains
 * 2. Global allowed_domains table
 * 
 * This enables institution-specific email validation during signup
 */
export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return NextResponse.json({
        isValid: false,
        error: 'Please enter a valid email address',
        domain: null
      }, { status: 400 });
    }

    // Extract domain from email
    const domain = email.trim().toLowerCase().split('@')[1];

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

    console.log(`[Email Validation] Checking domain: ${domain}`);

    // Step 1: Check organization-specific allowed domains
    // Get ALL active organizations and filter in JavaScript
    const { data: allOrgs, error: orgError } = await supabase
      .from('organizations')
      .select('id, name, slug, settings')
      .eq('is_active', true);

    console.log('[Email Validation] Raw query result:', {
      hasData: !!allOrgs,
      dataIsArray: Array.isArray(allOrgs),
      dataLength: allOrgs?.length,
      hasError: !!orgError,
      errorMessage: orgError?.message,
      rawData: JSON.stringify(allOrgs)
    });

    if (orgError) {
      console.error(`[Email Validation] Error fetching organizations:`, orgError);
    }

    // Filter to only orgs with non-empty allowed_email_domains arrays
    const orgsWithDomain = allOrgs?.filter((org: { name: string; settings?: { allowed_email_domains?: string[] } }) => {
      const domains = org.settings?.allowed_email_domains;
      const hasValidDomains = Array.isArray(domains) && domains.length > 0;
      console.log(`[Email Validation] Filtering org "${org.name}":`, {
        hasDomains: hasValidDomains,
        domains,
        settingsType: typeof org.settings,
        settingsKeys: org.settings ? Object.keys(org.settings) : null
      });
      return hasValidDomains;
    }) || [];

    console.log(`[Email Validation] Found ${allOrgs?.length || 0} total orgs, ${orgsWithDomain.length} have allowed domains`);
    console.log(`[Email Validation] Looking for domain: "${domain}"`);

    if (!orgError && orgsWithDomain && orgsWithDomain.length > 0) {
      // Check if any organization has this domain in their allowed list
      const matchingOrg = orgsWithDomain.find((org: { name: string; slug: string; settings?: { allowed_email_domains?: string[] } }) => {
        const allowedDomains = org.settings?.allowed_email_domains || [];
        const domainType = Array.isArray(allowedDomains) ? 'array' : typeof allowedDomains;
        console.log(`[Email Validation] Org "${org.name}":`, {
          slug: org.slug,
          domains: allowedDomains,
          domainType,
          isArray: Array.isArray(allowedDomains),
          rawSettings: JSON.stringify(org.settings).substring(0, 200)
        });
        
        if (!Array.isArray(allowedDomains)) {
          console.warn(`[Email Validation] ⚠️ allowed_email_domains is not an array for org "${org.name}"`);
          return false;
        }
        
        return allowedDomains.some((allowedDomain: string) => {
          const normalizedAllowed = allowedDomain.toLowerCase().trim();
          
          // Match exact domain or wildcard patterns
          let matches = false;
          
          if (normalizedAllowed.startsWith('*.')) {
            // Wildcard pattern: *.scaler.com matches sub.scaler.com but NOT scaler.com
            const wildcardDomain = normalizedAllowed.substring(2); // Remove *.
            matches = domain.endsWith('.' + wildcardDomain);
          } else {
            // Exact match only
            matches = domain === normalizedAllowed;
          }
          
          console.log(`[Email Validation]   Comparing "${domain}" with "${normalizedAllowed}": ${matches ? '✅' : '❌'}`);
          
          if (matches) {
            console.log(`[Email Validation] ✅ MATCH FOUND!`);
          }
          return matches;
        });
      });

      if (matchingOrg) {
        console.log(`[Email Validation] ✅ Found matching org: ${matchingOrg.name}`);
        return NextResponse.json({
          isValid: true,
          domain,
          organizationId: matchingOrg.id,
          organizationName: matchingOrg.name,
          organizationSlug: matchingOrg.slug
        });
      }
    }

    // Step 2: Check global allowed_domains table for general educational patterns
    const { data: allowedDomains, error: domainError } = await supabase
      .from('allowed_domains')
      .select('domain')
      .eq('is_active', true);

    console.log(`[Email Validation] Found ${allowedDomains?.length || 0} global allowed domains`);

    if (!domainError && allowedDomains && allowedDomains.length > 0) {
      const isAllowed = allowedDomains.some((d: { domain: string }) => {
        const pattern = d.domain.toLowerCase();
        // Check if domain matches or ends with the pattern
        const matches = domain.includes(pattern) || domain.endsWith(pattern);
        if (matches) {
          console.log(`[Email Validation] ✅ Matched global pattern: ${pattern}`);
        }
        return matches;
      });

      if (isAllowed) {
        console.log(`[Email Validation] ✅ Validated via global patterns`);
        return NextResponse.json({
          isValid: true,
          domain,
          isGenericEducational: true
        });
      }
    }

    // Step 3: No match found - reject
    console.log(`[Email Validation] ❌ Domain "${domain}" not found in any allowed list`);
    return NextResponse.json({
      isValid: false,
      error: 'Please use your institutional email address. If your institution is not yet onboarded, contact support.',
      domain
    });

  } catch (error) {
    console.error('Email validation error:', error);
    return NextResponse.json({
      isValid: false,
      error: 'Unable to validate email. Please try again.',
      domain: null
    }, { status: 500 });
  }
}
