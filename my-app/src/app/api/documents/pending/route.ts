import { withRole, success, apiError, getOrganizationContext, getTargetOrganizationIds } from '@/lib/api';
import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { requireApprovedReviewer } from '@/lib/documents/authz';

const PENDING_LIMIT = 200;

// GET /api/documents/pending - list pending documents for faculty/admin (org-scoped)
export const GET = withRole(['faculty', 'admin', 'org_admin', 'super_admin'], async (_req, { user }) => {
  const supabase = await createSupabaseServerClient();
  const orgContext = await getOrganizationContext(user);
  const targetOrgIds = getTargetOrganizationIds(orgContext);

  // Only organizations in which the caller is an APPROVED reviewer
  const allowed: string[] = [];
  for (const orgId of targetOrgIds) {
    if (await requireApprovedReviewer(user, orgId, supabase)) allowed.push(orgId);
  }
  if (allowed.length === 0) return apiError.forbidden('No approved reviewer access to this organization');

  const { data, error } = await supabase
    .from('documents')
    .select(
      'id, student_id, organization_id, document_type, title, institution, issue_date, file_url, ocr_confidence, verification_status, created_at, updated_at'
    )
    .eq('verification_status', 'pending')
    .in('organization_id', allowed)
    .order('created_at', { ascending: false })
    .limit(PENDING_LIMIT);

  if (error) {
    console.error('Error fetching pending documents:', error);
    return apiError.internal('Failed to fetch pending documents');
  }

  return success(data || []);
});
