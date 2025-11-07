import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabaseServer';

/**
 * POST /api/auth/resend-confirmation
 * 
 * Resends the email confirmation link for unconfirmed users.
 * Uses admin client to bypass authentication requirements.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email } = body;

    if (!email) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    const adminClient = await createSupabaseAdminClient();

    console.log('[RESEND_CONFIRMATION] Attempting to resend confirmation email for:', email);

    // Check if user exists
    const { data: existingUsers } = await adminClient.auth.admin.listUsers();
    const user = existingUsers?.users.find((u: { email?: string }) => u.email?.toLowerCase() === email.toLowerCase());

    if (!user) {
      console.error('[RESEND_CONFIRMATION] User not found:', email);
      return NextResponse.json(
        { error: 'No account found with this email address' },
        { status: 404 }
      );
    }

    // Check if already confirmed
    if (user.email_confirmed_at) {
      console.log('[RESEND_CONFIRMATION] User already confirmed:', email);
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
      console.error('[RESEND_CONFIRMATION] Failed to resend:', resendError);
      
      // Check for rate limit error
      if (resendError.message?.includes('rate limit') || resendError.message?.includes('too many')) {
        return NextResponse.json(
          { error: 'Please wait a few minutes before requesting another email' },
          { status: 429 }
        );
      }
      
      return NextResponse.json(
        { error: resendError.message || 'Failed to resend confirmation email' },
        { status: 400 }
      );
    }

    console.log('[RESEND_CONFIRMATION] ✅ Confirmation email resent successfully to:', email);

    return NextResponse.json({
      success: true,
      message: 'Verification email sent! Please check your inbox and spam folder.'
    });

  } catch (error: unknown) {
    console.error('[RESEND_CONFIRMATION] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
