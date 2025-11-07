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

    // Use admin client to bypass RLS (this is a public signup endpoint)
    const supabase = await createSupabaseAdminClient();

    // Get all active organizations
    const { data: allOrganizations, error } = await supabase
      .from('organizations')
      .select('id, name, slug, type, settings')
      .eq('is_active', true);

    if (error) {
      console.error('[CHECK_EMAIL] Database error:', error);
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
    console.error('[CHECK_EMAIL] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
