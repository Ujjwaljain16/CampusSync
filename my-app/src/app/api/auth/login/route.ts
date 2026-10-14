import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { enforceRateLimit } from '@/lib/rateLimit';
import { isValidEmail } from '@/lib/api';
import type { RoleRow } from '@/lib/api/utils/roles';
import { resolvePostLogin } from '@/lib/auth/postLogin';

/**
 * POST /api/auth/login   body: { email, password }
 *
 * Email + password sign-in done on the server, so the session cookies are written by the server as
 * HttpOnly cookies and the browser never holds the session in script-readable storage.
 *
 * Success: 200 { ok, role, organization_id, approval_status, redirectTo }
 * Wrong email OR wrong password (or unknown account): 401, one message for all of them (no account enumeration)
 * Unconfirmed email (only reported after the password was right): 403 { code: 'email_not_confirmed' }
 */

const JSON_HEADERS = { 'Cache-Control': 'no-store' };
const BAD_CREDENTIALS = 'Invalid email or password';

const reply = (body: Record<string, unknown>, status: number) =>
  NextResponse.json(body, { status, headers: JSON_HEADERS });

export async function POST(request: NextRequest) {
  // Per client address first, so junk bodies are cheap to reject ...
  const limited = enforceRateLimit(request, 'login', { interval: 15 * 60 * 1000, uniqueTokenPerInterval: 30 });
  if (limited) return limited;

  try {
    let body: { email?: unknown; password?: unknown };
    try {
      body = await request.json();
    } catch {
      return reply({ error: 'Email and password are required' }, 400);
    }

    const email = typeof body?.email === 'string' ? body.email.trim() : '';
    const password = typeof body?.password === 'string' ? body.password : '';
    if (!email || !password || email.length > 254 || password.length > 1024 || !isValidEmail(email)) {
      return reply({ error: 'Email and password are required' }, 400);
    }

    // ... and per account, to slow down password guessing spread over many addresses
    const perAccountLimited = enforceRateLimit(
      request,
      'login-account',
      { interval: 15 * 60 * 1000, uniqueTokenPerInterval: 10 },
      email.toLowerCase()
    );
    if (perAccountLimited) return perAccountLimited;

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error || !data?.user || !data?.session) {
      const status = (error as { status?: number } | null)?.status;
      const code = (error as { code?: string } | null)?.code;
      if (code === 'email_not_confirmed') {
        return reply({ error: 'Please confirm your email address before signing in.', code: 'email_not_confirmed' }, 403);
      }
      if (status === 429) {
        return reply({ error: 'Too many sign-in attempts. Please try again later.' }, 429);
      }
      // No HTTP status (network failure) or a 5xx: the auth service is the problem, not the credentials
      if (!error || !status || status >= 500) {
        console.error('[auth/login] auth service unavailable, status', status ?? 'none');
        return reply({ error: 'Sign-in is temporarily unavailable. Please try again.' }, 503);
      }
      return reply({ error: BAD_CREDENTIALS }, 401);
    }

    // Role / approval for the redirect target. A failure here must not block the login itself.
    let rows: RoleRow[] = [];
    try {
      const { data: roleRows, error: roleError } = await supabase
        .from('user_roles')
        .select('role, organization_id, approval_status, created_at')
        .eq('user_id', data.user.id)
        .order('created_at', { ascending: true });
      if (roleError) console.error('[auth/login] role query failed');
      else rows = (roleRows ?? []) as RoleRow[];
    } catch {
      console.error('[auth/login] role query threw');
    }

    return reply({ ok: true, ...resolvePostLogin(rows) }, 200);
  } catch (err) {
    console.error('[auth/login] unexpected error', err instanceof Error ? err.name : 'unknown');
    return reply({ error: 'Sign-in failed. Please try again.' }, 500);
  }
}
