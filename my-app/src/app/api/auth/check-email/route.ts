import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabaseServer';

/**
 * POST /api/auth/check-email
 * 
 * Check if an email domain matches any organization's allowed domains.
 * Used during signup to determine:
 * - If user can signup as student/faculty (domain match)
 * - Which organizations they can join
 * - If they should use recruiter flow instead (no domain match)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email } = body;

    if (!email || typeof email !== 'string') {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    // Extract domain from email
    const emailLower = email.toLowerCase().trim();
    const domain = emailLower.split('@')[1];

    if (!domain) {
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      );
    }

    // Validate environment variables
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      console.error('[CHECK_EMAIL] Missing NEXT_PUBLIC_SUPABASE_URL');
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error('[CHECK_EMAIL] Missing SUPABASE_SERVICE_ROLE_KEY');
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    // Use admin client to bypass RLS (this is a public signup endpoint)
    let supabase;
    try {
      supabase = await createSupabaseAdminClient();
    } catch (clientError) {
      console.error('[CHECK_EMAIL] Failed to create Supabase client:', clientError);
      return NextResponse.json(
        { error: 'Database connection failed' },
        { status: 500 }
      );
    }

    // Get all active organizations
    const { data: allOrganizations, error } = await supabase
      .from('organizations')
      .select('id, name, slug, type, settings')
      .eq('is_active', true);

    if (error) {
      console.error('[CHECK_EMAIL] Database error:', {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code
      });
      return NextResponse.json(
        { error: 'Failed to check email domain' },
        { status: 500 }
      );
    }

    // Filter organizations that have this domain in their allowed_email_domains
    const matches = (allOrganizations || []).filter((org: { settings?: unknown }) => {
      const settings = org.settings as { allowed_email_domains?: string[] };
      const allowedDomains = settings?.allowed_email_domains || [];
      return Array.isArray(allowedDomains) && allowedDomains.some(d => d.toLowerCase() === domain);
    });

    if (matches.length > 0) {
      // Email domain matches one or more organizations
      return NextResponse.json({
        canSignup: true,
        userType: 'student', // Default to student, can upgrade to faculty later
        matches: matches.map((org: { id: string; name: string; slug: string; type?: string }) => ({
          id: org.id,
          name: org.name,
          slug: org.slug,
          type: org.type
        })),
        domain,
        message: matches.length === 1
          ? `This email is registered with ${matches[0].name}`
          : `This email matches ${matches.length} organizations`
      });
    } else {
      // No domain match - suggest recruiter signup
      return NextResponse.json({
        canSignup: true,
        userType: 'recruiter',
        matches: [],
        domain,
        message: 'No organization found for this email domain. You can sign up as a recruiter to request access to organizations.'
      });
    }
  } catch (error: unknown) {
    console.error('[CHECK_EMAIL] Uncaught error:', error);
    
    // Log more details for fetch errors
    if (error instanceof TypeError && error.message.includes('fetch')) {
      console.error('[CHECK_EMAIL] Network/fetch error details:', {
        message: error.message,
        stack: error.stack,
        supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
        hasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY
      });
    }
    
    return NextResponse.json(
      { 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
