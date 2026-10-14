import { NextResponse } from 'next/server';
import { withSuperAdmin, apiError, isUuid } from '@/lib/api';
import { createSupabaseAdminClient } from '@/lib/supabaseServer';

/**
 * GET /api/v2/admin/super/organizations/[orgId]/stats
 * Get statistics for a specific organization (super admin only)
 */
export const GET = withSuperAdmin<{ orgId: string }>(async (_request, { params }) => {
  const { orgId } = params;
  if (!isUuid(orgId)) return apiError.badRequest('Invalid organization id');

  const db = await createSupabaseAdminClient();

  const { data: org, error: orgError } = await db
    .from('organizations')
    .select('id')
    .eq('id', orgId)
    .maybeSingle();
  if (orgError) {
    console.error('org stats: org lookup failed:', orgError);
    return apiError.internal('Failed to fetch organization stats');
  }
  if (!org) return apiError.notFound('Organization not found');

  const base = (table: string) => db.from(table).select('*', { count: 'exact', head: true }).eq('organization_id', orgId);
  const results = await Promise.all([
    base('user_roles'),
    base('user_roles').eq('role', 'student'),
    base('user_roles').eq('role', 'faculty'),
    base('user_roles').eq('role', 'recruiter'),
    base('certificates'),
    base('certificates').eq('verification_status', 'verified'),
    base('certificates').eq('verification_status', 'pending'),
  ]);

  const failed = results.find((r) => r.error);
  if (failed) {
    console.error('org stats query failed:', failed.error);
    return apiError.internal('Failed to fetch organization stats');
  }
  const [users, students, faculty, recruiters, certs, verified, pending] = results.map((r) => r.count || 0);

  return NextResponse.json({
    data: {
      total_users: users,
      total_students: students,
      total_faculty: faculty,
      total_recruiters: recruiters,
      total_certificates: certs,
      active_verifications: verified,
      pending_approvals: pending,
    },
  });
});
