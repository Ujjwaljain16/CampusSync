import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabaseServer';

/**
 * GET /api/v2/admin/super/stats
 * Get platform-wide statistics (super admin only)
 */
export async function GET() {
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

    // Get platform statistics
    const { count: totalOrganizations } = await supabase
      .from('organizations')
      .select('*', { count: 'exact', head: true });

    const { count: totalUsers } = await supabase
      .from('user_roles')
      .select('*', { count: 'exact', head: true });

    const { count: totalStudents } = await supabase
      .from('user_roles')
      .select('*', { count: 'exact', head: true })
      .eq('role', 'student');

    const { count: totalFaculty } = await supabase
      .from('user_roles')
      .select('*', { count: 'exact', head: true })
      .eq('role', 'faculty');

    const { count: totalCertificates } = await supabase
      .from('certificates')
      .select('*', { count: 'exact', head: true });

    const { count: activeVerifications } = await supabase
      .from('certificates')
      .select('*', { count: 'exact', head: true })
      .eq('verification_status', 'pending');

    return NextResponse.json({
      data: {
        total_organizations: totalOrganizations || 0,
        total_users: totalUsers || 0,
        total_students: totalStudents || 0,
        total_faculty: totalFaculty || 0,
        total_certificates: totalCertificates || 0,
        active_verifications: activeVerifications || 0
      }
    });
  } catch (error: unknown) {
    console.error('GET /api/v2/admin/super/stats error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch statistics' },
      { status: 500 }
    );
  }
}
