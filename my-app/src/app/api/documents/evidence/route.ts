import { NextRequest } from 'next/server';
import { withRole, success, apiError, isValidUUID, getOrganizationContext, getTargetOrganizationIds } from '@/lib/api';
import { createSupabaseServerClient } from '@/lib/supabaseServer';

// GET /api/documents/evidence?documentId=... - verification evidence for reviewers (org-scoped)
export const GET = withRole(['faculty', 'admin', 'org_admin', 'super_admin'], async (request: NextRequest, { user }) => {
  const { searchParams } = new URL(request.url);
  const documentId = searchParams.get('documentId');
  if (!documentId || !isValidUUID(documentId)) throw apiError.badRequest('Valid documentId required');

  const supabase = await createSupabaseServerClient();
  const orgContext = await getOrganizationContext(user);
  const targetOrgIds = getTargetOrganizationIds(orgContext);

  // Ensure the document belongs to the reviewer's organization(s)
  const { data: doc } = await supabase
    .from('documents')
    .select('id')
    .eq('id', documentId)
    .in('organization_id', targetOrgIds)
    .maybeSingle();
  if (!doc) throw apiError.notFound('Document not found');

  const { data, error } = await supabase
    .from('document_metadata')
    .select('verification_details, ai_confidence_score')
    .eq('document_id', documentId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return success({});

  const details = (data as Record<string, unknown>).verification_details as Record<string, unknown> || {};
  const out = {
    qr: details.qr || null,
    mrz: details.mrz || null,
    logo: details.logo || null,
    policy: details.policy || null,
    extracted: details.extracted || null,
    confidence: (data as Record<string, unknown>).ai_confidence_score ?? undefined
  };
  return success(out);
});
