import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabaseServer';

/**
 * GET /api/v2/admin/super/organizations/[orgId]/stats
 * Get statistics for a specific organization (super admin only)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const supabase = await createSupabaseServerClient();

    // Check if user is super admin
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: userRole, error: roleError } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    if (roleError || userRole?.role !== 'super_admin') {
      return NextResponse.json({ error: 'Super admin access required' }, { status: 403 });
    }

    const { orgId } = await params;

    // Verify organization exists
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .select('id')
      .eq('id', orgId)
      .single();

    if (orgError || !org) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    }

    // Get user counts by role
    const { count: totalUsers } = await supabase
      .from('user_roles')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', orgId);

    const { count: totalStudents } = await supabase
      .from('user_roles')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .eq('role', 'student');

    const { count: totalFaculty } = await supabase
      .from('user_roles')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .eq('role', 'faculty');

    const { count: totalRecruiters } = await supabase
      .from('user_roles')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .eq('role', 'recruiter');

    // Get certificate counts
    const { count: totalCertificates } = await supabase
      .from('certificates')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', orgId);

    const { count: activeVerifications } = await supabase
      .from('certificates')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .eq('verification_status', 'verified');

    const { count: pendingApprovals } = await supabase
      .from('certificates')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .eq('verification_status', 'pending');

    const stats = {
      total_users: totalUsers || 0,
      total_students: totalStudents || 0,
      total_faculty: totalFaculty || 0,
      total_recruiters: totalRecruiters || 0,
      total_certificates: totalCertificates || 0,
      active_verifications: activeVerifications || 0,
      pending_approvals: pendingApprovals || 0
    };

    return NextResponse.json({ data: stats });
  } catch (error: unknown) {
    console.error('GET /api/v2/admin/super/organizations/[orgId]/stats error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch organization stats' },
      { status: 500 }
    );
  }
}
