// Admin analytics API
import { withRole, success, apiError, resolveAdminOrg } from '@/lib/api';
import { createSupabaseServerClient } from '@/lib/supabaseServer';

export const GET = withRole(['admin', 'org_admin', 'super_admin'], async (req, { user }) => {
  const supabase = await createSupabaseServerClient();
  const requestedOrg = req.headers.get('X-Organization-ID') || new URL(req.url).searchParams.get('organization_id');
  const scope = await resolveAdminOrg(user, requestedOrg, 'admin');
  const allOrgs = scope.isSuperAdmin && !scope.requested;

  // Role distribution comes from user_roles (authoritative), not profiles.role
  let rolesQuery = supabase.from('user_roles').select('user_id, role, approval_status').eq('approval_status', 'approved');
  let certsQuery = supabase.from('certificates').select('id, verification_status, created_at');
  let roleReqQuery = supabase.from('role_requests').select('id, status, created_at');

  if (!allOrgs) {
    rolesQuery = rolesQuery.eq('organization_id', scope.organizationId);
    certsQuery = certsQuery.eq('organization_id', scope.organizationId);
    roleReqQuery = roleReqQuery.eq('organization_id', scope.organizationId);
  }

  const [
    { data: users, error: usersError },
    { data: certificates, error: certsError },
    { data: roleRequests, error: roleError }
  ] = await Promise.all([rolesQuery, certsQuery, roleReqQuery]);

  if (usersError || certsError || roleError) {
    console.error('Analytics errors:', { usersError, certsError, roleError });
    return apiError.internal('Failed to fetch analytics data');
  }

  const totalUsers = users?.length || 0;
  const totalCertificates = certificates?.length || 0;
  const pendingRoleRequests = roleRequests?.filter(r => r.status === 'pending').length || 0;
  const verifiedCertificates = certificates?.filter(c => c.verification_status === 'verified').length || 0;

  const analytics = {
    users: {
      total: totalUsers,
      byRole: {
        student: users?.filter(u => u.role === 'student').length || 0,
        faculty: users?.filter(u => u.role === 'faculty').length || 0,
        recruiter: users?.filter(u => u.role === 'recruiter').length || 0,
        admin: users?.filter(u => u.role === 'admin' || u.role === 'org_admin').length || 0
      }
    },
    certificates: {
      total: totalCertificates,
      verified: verifiedCertificates,
      pending: totalCertificates - verifiedCertificates,
      verificationRate: totalCertificates > 0 ? (verifiedCertificates / totalCertificates * 100).toFixed(1) : 0
    },
    roleRequests: {
      pending: pendingRoleRequests
    },
    // Process uptime of a serverless instance is not a meaningful platform metric
    system: {
      available: false,
      uptime: null,
      timestamp: new Date().toISOString()
    }
  };

  return success(analytics);
});
