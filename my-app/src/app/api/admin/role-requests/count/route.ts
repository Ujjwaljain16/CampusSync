import { withRole, success, getOrganizationContext, getTargetOrganizationIds } from '@/lib/api';
import { createSupabaseServerClient } from '@/lib/supabaseServer';

export const GET = withRole(['admin', 'org_admin', 'super_admin'], async (_req, { user }) => {
  const supabase = await createSupabaseServerClient();
  const orgContext = await getOrganizationContext(user);
  const targetOrgIds = getTargetOrganizationIds(orgContext);
  
  // Build query - super admins see all, org admins see only their org
  let query = supabase
    .from('role_requests')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pending');
  
  if (!orgContext.isSuperAdmin) {
    query = query.in('organization_id', targetOrgIds);
  }
  
  const { count } = await query;
  return success({ pending: count || 0 });
});





