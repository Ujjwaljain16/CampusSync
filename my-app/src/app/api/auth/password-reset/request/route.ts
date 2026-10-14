import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { enforceRateLimit } from '@/lib/rateLimit';
import { isValidEmail } from '@/lib/api';

/**
 * POST /api/auth/password-reset/request   body: { email }
 *
 * Asks Supabase to email a password reset link. Done on the server so the PKCE code verifier cookie is
 * written by the server (HttpOnly). The link's `redirectTo` is the existing /api/auth/callback route, which
 * exchanges the code and sends the browser on to /reset-password.
 *
 * The answer is the same whether or not the address belongs to an account (no account enumeration).
 */

const GENERIC_MESSAGE = 'If an account exists for that email address, a password reset link has been sent.';

const reply = (body: Record<string, unknown>, status: number) =>
  NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

function siteOrigin(request: NextRequest): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) {
    try {
      return new URL(configured).origin;
    } catch {
      // fall through to the request origin
    }
  }
  return new URL(request.url).origin;
}

export async function POST(request: NextRequest) {
  const limited = enforceRateLimit(request, 'password-reset', { interval: 15 * 60 * 1000, uniqueTokenPerInterval: 10 });
  if (limited) return limited;

  let email = '';
  try {
    const body = (await request.json()) as { email?: unknown };
    email = typeof body?.email === 'string' ? body.email.trim() : '';
  } catch {
    // handled below
  }
  if (!email || email.length > 254 || !isValidEmail(email)) {
    return reply({ error: 'A valid email address is required' }, 400);
  }

  // One mailbox cannot be mail-bombed from many addresses
  const perEmailLimited = enforceRateLimit(
    request,
    'password-reset-email',
    { interval: 15 * 60 * 1000, uniqueTokenPerInterval: 3 },
    email.toLowerCase()
  );
  if (perEmailLimited) return perEmailLimited;

  try {
    const supabase = await createSupabaseServerClient();
    const redirectTo = `${siteOrigin(request)}/api/auth/callback?redirectTo=${encodeURIComponent('/reset-password')}`;
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) {
      // Never tell the caller: the answer must not depend on the account (or on mail rate limits).
      console.error('[password-reset/request] provider error, status', (error as { status?: number }).status ?? 'none');
    }
  } catch (err) {
    console.error('[password-reset/request] unexpected error', err instanceof Error ? err.name : 'unknown');
  }

  return reply({ ok: true, message: GENERIC_MESSAGE }, 200);
}
