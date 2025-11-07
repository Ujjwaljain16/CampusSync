import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

/**
 * Email Confirmation Handler
 * 
 * This route handles email confirmation links sent by Supabase.
 * Used for:
 * - Signup email verification
 * - Email change confirmation
 * 
 * Supabase email templates should link to:
 * {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get('token_hash');
  const type = searchParams.get('type') as 'signup' | 'email_change' | null;
  const next = searchParams.get('next') || '/login';

  console.log('[AUTH_CONFIRM] Received confirmation request:', { type, hasToken: !!token_hash });

  if (!token_hash || !type) {
    console.error('[AUTH_CONFIRM] Missing token_hash or type parameter');
    return NextResponse.redirect(
      new URL('/login?error=Invalid+confirmation+link', request.url)
    );
  }

  // Create Supabase client with cookie handling
  const cookieStore: Array<{ name: string; value: string; options?: Record<string, unknown> }> = [];
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach((cookie) => {
            cookieStore.push(cookie);
          });
        },
      },
    }
  );

  try {
    // Verify the token hash with Supabase
    const { data, error } = await supabase.auth.verifyOtp({
      token_hash,
      type: type as 'signup' | 'email_change',
    });

    if (error) {
      console.error('[AUTH_CONFIRM] Verification failed:', error);
      return NextResponse.redirect(
        new URL(`/login?error=${encodeURIComponent(error.message)}`, request.url)
      );
    }

    if (!data.user) {
      console.error('[AUTH_CONFIRM] No user returned after verification');
      return NextResponse.redirect(
        new URL('/login?error=Verification+failed', request.url)
      );
    }

    console.log('[AUTH_CONFIRM] Email confirmed successfully for:', data.user.email);

    // Create response with cookies
    const redirectUrl = new URL(next, request.url);
    
    // Add success message
    if (type === 'signup') {
      redirectUrl.searchParams.set('message', 'Email confirmed! You can now sign in.');
    } else if (type === 'email_change') {
      redirectUrl.searchParams.set('message', 'Email changed successfully!');
    }

    const response = NextResponse.redirect(redirectUrl);

    // Apply cookies to response
    cookieStore.forEach(({ name, value, options }) => {
      response.cookies.set(name, value, options);
    });

    return response;
  } catch (err) {
    console.error('[AUTH_CONFIRM] Unexpected error:', err);
    return NextResponse.redirect(
      new URL('/login?error=An+unexpected+error+occurred', request.url)
    );
  }
}
