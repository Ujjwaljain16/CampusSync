import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { enforceRateLimit } from '@/lib/rateLimit';
import { validateNewPassword } from '@/lib/auth/passwordRules';

/**
 * POST /api/auth/password-reset/update   body: { password }
 *
 * Sets a new password for the signed-in user. Intended for the recovery session that
 * /api/auth/callback (code exchange) or /api/auth/password-reset/verify (token_hash) established, so it
 * needs a valid session cookie. Afterwards ALL of the user's sessions are ended (the recovery session and
 * any other device), so the user signs in again with the new password.
 */

const reply = (body: Record<string, unknown>, status: number) =>
  NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export async function POST(request: NextRequest) {
  const limited = enforceRateLimit(request, 'password-reset-update', { interval: 15 * 60 * 1000, uniqueTokenPerInterval: 10 });
  if (limited) return limited;

  let password: unknown;
  try {
    password = ((await request.json()) as { password?: unknown })?.password;
  } catch {
    return reply({ error: 'Invalid request body' }, 400);
  }

  const invalid = validateNewPassword(password);
  if (invalid) return reply({ error: invalid }, 400);

  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return reply({ error: 'Your reset session has expired. Please request a new password reset link.' }, 401);
    }

    const { error: updateError } = await supabase.auth.updateUser({ password: password as string });
    if (updateError) {
      const code = (updateError as { code?: string }).code;
      if (code === 'same_password') {
        return reply({ error: 'The new password must be different from your current password.' }, 422);
      }
      if (code === 'weak_password') {
        return reply({ error: 'That password is too weak. Please choose a stronger one.' }, 422);
      }
      console.error('[password-reset/update] update failed, code', code ?? 'none');
      return reply({ error: 'Could not update the password. Please request a new reset link and try again.' }, 400);
    }

    // The password is changed. End every session (global scope also revokes other devices). A failure here
    // must not hide the success, but is logged.
    try {
      const { error: signOutError } = await supabase.auth.signOut({ scope: 'global' });
      if (signOutError) console.error('[password-reset/update] sign-out after reset failed');
    } catch {
      console.error('[password-reset/update] sign-out after reset threw');
    }

    return reply({ ok: true }, 200);
  } catch (err) {
    console.error('[password-reset/update] unexpected error', err instanceof Error ? err.name : 'unknown');
    return reply({ error: 'Failed to reset the password. Please try again.' }, 500);
  }
}
