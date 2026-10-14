import { withRole, success, apiError, resolveAdminOrg } from '@/lib/api';
import { createSupabaseAdminClient } from '@/lib/supabaseServer';

export const GET = withRole(['admin', 'org_admin', 'super_admin'], async (req, { user }) => {
  const requestedOrg = req.headers.get('X-Organization-ID') || new URL(req.url).searchParams.get('organization_id');
  const scope = await resolveAdminOrg(user, requestedOrg, 'admin');
  const adminSupabase = await createSupabaseAdminClient();

  let query = adminSupabase
    .from('role_requests')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending');

  // Only a super_admin who did not pick an organization sees every organization
  if (!(scope.isSuperAdmin && !scope.requested)) {
    query = query.eq('organization_id', scope.organizationId);
  }

  const { count, error } = await query;
  if (error) {
    console.error('[admin/role-requests/count] query failed:', error);
    return apiError.internal('Failed to count role requests');
  }
  return success({ pending: count || 0 });
});
