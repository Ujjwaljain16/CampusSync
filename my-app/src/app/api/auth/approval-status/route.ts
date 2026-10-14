import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { isApprovedRow, pickHighestRow, type RoleRow } from '@/lib/api/utils/roles';

/**
 * GET /api/auth/approval-status?role=faculty|recruiter
 *
 * The signed-in user's approval state for ONE role, for the "awaiting approval" pages that poll it
 * (they used to subscribe to database changes from the browser). Same row-picking as /api/auth/me: with
 * several rows of that role, an approved one wins over a pending one.
 *
 * 200 { role, has_role, organization_id, organization_name, approval_status, requested_at, approved_at,
 *       approved_by, approval_notes }   (has_role is false and approval_status null when the user has no such role row)
 * 401 when not signed in
 */

interface ApprovalRow extends RoleRow {
  approved_at?: string | null;
  approved_by?: string | null;
  approval_notes?: string | null;
}

const ROLES = new Set(['faculty', 'recruiter']);

export async function GET(request: NextRequest) {
  const role = new URL(request.url).searchParams.get('role') ?? '';
  if (!ROLES.has(role)) {
    return NextResponse.json({ error: 'role must be faculty or recruiter' }, { status: 400 });
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { data: rowData, error: rowError } = await supabase
      .from('user_roles')
      .select('role, organization_id, approval_status, created_at, approved_at, approved_by, approval_notes')
      .eq('user_id', user.id)
      .eq('role', role)
      .order('created_at', { ascending: true });

    if (rowError) {
      console.error('[auth/approval-status] role query failed');
      return NextResponse.json({ error: 'Failed to load approval status' }, { status: 500 });
    }

    const rows = (rowData ?? []) as ApprovalRow[];
    const row = pickHighestRow(rows.filter((r) => isApprovedRow(r))) ?? pickHighestRow(rows);
    if (!row) {
      return NextResponse.json(
        { role, has_role: false, organization_id: null, organization_name: null, approval_status: null },
        { headers: { 'Cache-Control': 'no-store' } }
      );
    }

    let organizationName: string | null = null;
    if (row.organization_id) {
      const { data: org } = await supabase
        .from('organizations')
        .select('name')
        .eq('id', row.organization_id)
        .maybeSingle();
      organizationName = (org as { name?: string } | null)?.name ?? null;
    }

    return NextResponse.json(
      {
        role,
        has_role: true,
        organization_id: row.organization_id ?? null,
        organization_name: organizationName,
        // a legacy NULL status counts as approved for non-admin roles (same rule as everywhere else)
        approval_status: row.approval_status ?? (isApprovedRow(row) ? 'approved' : 'pending'),
        requested_at: row.created_at ?? null,
        approved_at: row.approved_at ?? null,
        approved_by: row.approved_by ?? null,
        approval_notes: row.approval_notes ?? null,
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    console.error('[auth/approval-status] unexpected error', err instanceof Error ? err.name : 'unknown');
    return NextResponse.json({ error: 'Failed to load approval status' }, { status: 500 });
  }
}
