import { withRole, success, apiError, getOrganizationContext, getTargetOrganizationIds } from '@/lib/api';
import { createSupabaseServerClient } from '@/lib/supabaseServer';

// GET /api/documents/pending - list pending documents for faculty/admin (org-scoped)
export const GET = withRole(['faculty', 'admin'], async (_req, { user }) => {
  const supabase = await createSupabaseServerClient();
  const orgContext = await getOrganizationContext(user);
  const targetOrgIds = getTargetOrganizationIds(orgContext);
  
  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .eq('verification_status', 'pending')
    .in('organization_id', targetOrgIds) // Multi-org filter
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching pending documents:', error);
    throw apiError.internal('Failed to fetch pending documents');
  }

  console.log(`[Documents Pending API] Found ${data?.length || 0} pending documents`);

  return success(data || []);
});

