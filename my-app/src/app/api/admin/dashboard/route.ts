import { withRole, success, apiError, resolveAdminOrg } from '@/lib/api';
import { createSupabaseServerClient } from '@/lib/supabaseServer';

export const GET = withRole(['admin', 'org_admin', 'super_admin'], async (req, { user }) => {
  const supabase = await createSupabaseServerClient();
  const requestedOrg = req.headers.get('X-Organization-ID') || new URL(req.url).searchParams.get('organization_id');
  const scope = await resolveAdminOrg(user, requestedOrg, 'admin');
  const allOrgs = scope.isSuperAdmin && !scope.requested;

  // Org admins see only their organization; a super admin without a selection sees all
  const orgFilter: Record<string, unknown> = allOrgs ? {} : { organization_id: scope.organizationId };

  const { count: totalUsers, error: usersError } = await supabase
    .from('profiles')
    .select('*', { count: 'exact', head: true })
    .match(orgFilter);

  const { count: totalCertificates, error: certsError } = await supabase
    .from('certificates')
    .select('*', { count: 'exact', head: true })
    .match(orgFilter);

  const { count: pendingApprovals, error: pendingError } = await supabase
    .from('role_requests')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pending')
    .match(orgFilter);

  if (usersError || certsError || pendingError) {
    console.error('[admin/dashboard] count errors:', { usersError, certsError, pendingError });
    return apiError.internal('Failed to load dashboard');
  }

  const { data: recentActivity } = await supabase
    .from('audit_logs')
    .select('action, created_at, actor_id')
    .match(orgFilter)
    .order('created_at', { ascending: false })
    .limit(10);

  return success({
    user: {
      id: user.id,
      email: user.email,
      role: scope.role,
      organizationId: scope.organizationId,
      isSuperAdmin: scope.isSuperAdmin
    },
    stats: {
      total_users: totalUsers || 0,
      total_certificates: totalCertificates || 0,
      pending_approvals: pendingApprovals || 0,
      // Not measured: do not claim "good"
      system_health: null
    },
    recent_activity: recentActivity || [],
    message: 'Admin dashboard loaded successfully'
  });
});
