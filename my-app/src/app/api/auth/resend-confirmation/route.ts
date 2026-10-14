import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabaseServer';
import { enforceRateLimit } from '@/lib/rateLimit';
import { enforceGlobalRateLimit } from '@/lib/rateLimitGlobal';
import { findAuthUserByEmail } from '@/lib/auth/findUserByEmail';

/**
 * POST /api/auth/resend-confirmation
 * 
 * Resends the email confirmation link for unconfirmed users.
 * Uses admin client to bypass authentication requirements.
 */
export async function POST(request: NextRequest) {
  // Sends email: prevent abuse as a mail-bomb / enumeration vector
  const limited = enforceRateLimit(request, 'resend-confirmation', { interval: 10 * 60 * 1000, uniqueTokenPerInterval: 5 });
  if (limited) return limited;
  const globalLimited = await enforceGlobalRateLimit(request, 'resend-confirmation', { limit: 5, windowSeconds: 10 * 60 });
  if (globalLimited) return globalLimited;

  try {
    const body = await request.json();
    const { email } = body;

    if (!email || typeof email !== 'string') {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    // Per-address brake so a single mailbox cannot be mail-bombed from many IPs
    const perEmailLimited = enforceRateLimit(
      request,
      'resend-confirmation-email',
      { interval: 10 * 60 * 1000, uniqueTokenPerInterval: 3 },
      email.trim().toLowerCase()
    );
    if (perEmailLimited) return perEmailLimited;
    const perEmailGlobalLimited = await enforceGlobalRateLimit(
      request,
      'resend-confirmation-email',
      { limit: 3, windowSeconds: 10 * 60 },
      email.trim().toLowerCase()
    );
    if (perEmailGlobalLimited) return perEmailGlobalLimited;

    const adminClient = await createSupabaseAdminClient();

    // Check if user exists (paginated lookup)
    const user = await findAuthUserByEmail(adminClient, email);

    if (!user) {
      return NextResponse.json(
        { error: 'No account found with this email address' },
        { status: 404 }
      );
    }

    // Check if already confirmed
    if (user.email_confirmed_at) {
      return NextResponse.json(
        { 
          success: true,
          message: 'Your email is already confirmed. You can sign in now.',
          alreadyConfirmed: true
        },
        { status: 200 }
      );
    }

    // Use the admin client to send the confirmation email
    // We'll use the regular client with resend method
    const { createClient } = await import('@supabase/supabase-js');
    const regularClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const { error: resendError } = await regularClient.auth.resend({
      type: 'signup',
      email: email,
    });

    if (resendError) {
      console.error('[RESEND_CONFIRMATION] Failed to resend:', resendError.message);
      
      // Check for rate limit error
      if (resendError.message?.includes('rate limit') || resendError.message?.includes('too many')) {
        return NextResponse.json(
          { error: 'Please wait a few minutes before requesting another email' },
          { status: 429 }
        );
      }
      
      return NextResponse.json(
        { error: 'Failed to resend confirmation email' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Verification email sent! Please check your inbox and spam folder.'
    });

  } catch (error: unknown) {
    console.error('[RESEND_CONFIRMATION] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
