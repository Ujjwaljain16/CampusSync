import { withRole, success, getOrganizationContext, isRecruiterContext } from '@/lib/api';
import { createSupabaseServerClient } from '@/lib/supabaseServer';

export const GET = withRole(['admin', 'org_admin', 'super_admin'], async (_req, { user }) => {
  const supabase = await createSupabaseServerClient();
  const orgContext = await getOrganizationContext(user);
  
  // Super admins can see all organizations, org admins see only their org
  // Handle both OrganizationContext and RecruiterContext
  let orgFilter: Record<string, unknown> = {};
  if (!orgContext.isSuperAdmin) {
    if (isRecruiterContext(orgContext)) {
      // Recruiters shouldn't access admin dashboard, but handle gracefully
      if (orgContext.selectedOrganization) {
        orgFilter = { organization_id: orgContext.selectedOrganization };
      } else {
        // Multiple orgs - use first accessible one or empty for safety
        orgFilter = orgContext.accessibleOrganizations.length > 0 
          ? { organization_id: orgContext.accessibleOrganizations[0] }
          : {};
      }
    } else {
      orgFilter = { organization_id: orgContext.organizationId };
    }
  }
  
  // Get total users in organization(s)
  const { count: totalUsers } = await supabase
    .from('profiles')
    .select('*', { count: 'exact', head: true })
    .match(orgFilter);
  
  // Get total certificates in organization(s)
  const { count: totalCertificates } = await supabase
    .from('certificates')
    .select('*', { count: 'exact', head: true })
    .match(orgFilter);
  
  // Get pending role requests for organization(s)
  const { count: pendingApprovals } = await supabase
    .from('role_requests')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pending')
    .match(orgFilter);
  
  // Get recent activity (last 10 audit logs for organization)
  const { data: recentActivity } = await supabase
    .from('audit_logs')
    .select('action, created_at, user_id')
    .match(orgFilter)
    .order('created_at', { ascending: false })
    .limit(10);
  
  return success({
    user: {
      id: user.id,
      email: user.email,
      role: orgContext.role,
      organizationId: isRecruiterContext(orgContext) 
        ? orgContext.selectedOrganization || orgContext.accessibleOrganizations[0] || null
        : orgContext.organizationId,
      isSuperAdmin: orgContext.isSuperAdmin
    },
    stats: {
      total_users: totalUsers || 0,
      total_certificates: totalCertificates || 0,
      pending_approvals: pendingApprovals || 0,
      system_health: 'good'
    },
    recent_activity: recentActivity || [],
    message: 'Admin dashboard loaded successfully'
  });
});