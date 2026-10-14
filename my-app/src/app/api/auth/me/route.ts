import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { isApprovedRow, pickHighestRow, type RoleRow } from '@/lib/api/utils/roles';

/**
 * GET /api/auth/me
 *
 * The current user's profile and role. A user may hold several user_roles rows (one per organization, or a
 * platform-level row next to organization rows), so this picks the highest-privilege APPROVED row; when nothing is
 * approved yet it reports the highest row so the UI can show "awaiting approval".
 */
export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    const { data: roleRows } = await supabase
      .from('user_roles')
      .select('role, organization_id, approval_status, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true });

    const rows = (roleRows ?? []) as RoleRow[];
    const roleData = pickHighestRow(rows.filter((r) => isApprovedRow(r))) ?? pickHighestRow(rows);

    // profiles is keyed by id (= auth user id)
    const { data: profileData } = await supabase
      .from('profiles')
      .select('full_name, email, organization_id')
      .eq('id', user.id)
      .maybeSingle();

    return NextResponse.json({
      user_id: user.id,
      email: user.email,
      role: roleData?.role || null,
      organization_id: roleData?.organization_id || profileData?.organization_id || null,
      approval_status: roleData?.approval_status || null,
      full_name: profileData?.full_name || null,
    });

  } catch (error: unknown) {
    console.error('[AUTH-ME] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
