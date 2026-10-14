import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { enforceRateLimit } from '@/lib/rateLimit';

/**
 * POST /api/auth/password-reset/verify   body: { token_hash, type: 'recovery' }
 *
 * Exchanges the single-use `token_hash` from a password reset email link (/reset-password?token_hash=...)
 * for a recovery session. The session cookies are set by the server (HttpOnly), exactly like a login.
 * The reset page calls this from a POST (not a link GET) so mail scanners that pre-fetch links do not
 * use the token up.
 */

const reply = (body: Record<string, unknown>, status: number) =>
  NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export async function POST(request: NextRequest) {
  const limited = enforceRateLimit(request, 'password-reset-verify', { interval: 15 * 60 * 1000, uniqueTokenPerInterval: 20 });
  if (limited) return limited;

  let tokenHash = '';
  let type = '';
  try {
    const body = (await request.json()) as { token_hash?: unknown; type?: unknown };
    tokenHash = typeof body?.token_hash === 'string' ? body.token_hash : '';
    type = typeof body?.type === 'string' ? body.type : '';
  } catch {
    // handled below
  }
  if (!tokenHash || tokenHash.length > 512 || type !== 'recovery') {
    return reply({ error: 'Invalid or expired reset link. Please request a new one.' }, 400);
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' });
    if (error || !data?.session) {
      return reply({ error: 'Invalid or expired reset link. Please request a new one.' }, 400);
    }
    return reply({ ok: true }, 200);
  } catch (err) {
    console.error('[password-reset/verify] unexpected error', err instanceof Error ? err.name : 'unknown');
    return reply({ error: 'Failed to verify the reset link. Please try again.' }, 500);
  }
}
