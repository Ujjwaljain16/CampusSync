// Admin analytics API
import { withRole, success, apiError } from '@/lib/api';
import { createSupabaseServerClient } from '@/lib/supabaseServer';

export const GET = withRole(['admin'], async () => {
  const supabase = await createSupabaseServerClient();

  const [
    { data: users, error: usersError },
    { data: certificates, error: certsError },
    { data: roleRequests, error: roleError }
  ] = await Promise.all([
    supabase.from('profiles').select('id, role, created_at'),
    supabase.from('certificates').select('id, verification_status, created_at'),
    supabase.from('role_requests').select('id, status, created_at')
  ]);

  if (usersError || certsError || roleError) {
    console.error('Analytics errors:', { usersError, certsError, roleError });
    throw apiError.internal('Failed to fetch analytics data');
  }

  // Calculate analytics
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
        admin: users?.filter(u => u.role === 'admin').length || 0
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
    system: {
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    }
  };

  return success(analytics);
});
