import { NextResponse } from 'next/server';
import { withSuperAdmin, apiError } from '@/lib/api';
import { createSupabaseAdminClient } from '@/lib/supabaseServer';

/**
 * GET /api/v2/admin/super/stats
 * Get platform-wide statistics (super admin only)
 */
export const GET = withSuperAdmin(async () => {
  const db = await createSupabaseAdminClient();

  const count = async (table: string, apply?: (q: ReturnType<typeof base>) => ReturnType<typeof base>) => {
    const q = apply ? apply(base(table)) : base(table);
    const { count: c, error } = await q;
    if (error) throw error;
    return c || 0;
  };
  const base = (table: string) => db.from(table).select('*', { count: 'exact', head: true });

  try {
    const [totalOrganizations, totalUsers, totalStudents, totalFaculty, totalCertificates, activeVerifications] =
      await Promise.all([
        count('organizations'),
        count('user_roles'),
        count('user_roles', (q) => q.eq('role', 'student')),
        count('user_roles', (q) => q.eq('role', 'faculty')),
        count('certificates'),
        count('certificates', (q) => q.eq('verification_status', 'pending')),
      ]);

    return NextResponse.json({
      data: {
        total_organizations: totalOrganizations,
        total_users: totalUsers,
        total_students: totalStudents,
        total_faculty: totalFaculty,
        total_certificates: totalCertificates,
        active_verifications: activeVerifications,
      },
    });
  } catch (error: unknown) {
    console.error('GET /api/v2/admin/super/stats error:', error);
    return apiError.internal('Failed to fetch statistics');
  }
});
