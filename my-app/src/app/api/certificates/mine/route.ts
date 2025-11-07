import { withAuth, success, apiError, getOrganizationContext, getTargetOrganizationIds } from '@/lib/api';
import { createSupabaseServerClient } from '@/lib/supabaseServer';

/**
 * GET /api/certificates/mine
 * Returns all certificates for the authenticated user (within their organization)
 */
export const GET = withAuth(async (_request, { user }) => {
  const supabase = await createSupabaseServerClient();
  const orgContext = await getOrganizationContext(user);
  const targetOrgIds = getTargetOrganizationIds(orgContext);

  const { data, error } = await supabase
    .from('certificates')
    .select('id, title, institution, date_issued, file_url, verification_status, created_at, auto_approved')
    .eq('student_id', user.id)
    .in('organization_id', targetOrgIds) // Multi-org filter
    .order('created_at', { ascending: false });

  if (error) return apiError.internal(error.message);
  return success(data);
});





