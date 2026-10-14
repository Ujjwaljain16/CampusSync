import { NextRequest } from 'next/server';
import { withAuth, success, apiError, isValidUUID } from '@/lib/api';
import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { loadDocumentHead, requireApprovedReviewer } from '@/lib/documents/authz';

// GET /api/documents/evidence?documentId=... - verification evidence for approved reviewers of the document's org
export const GET = withAuth(async (request: NextRequest, { user }) => {
  const { searchParams } = new URL(request.url);
  const documentId = searchParams.get('documentId');
  if (!documentId || !isValidUUID(documentId)) return apiError.badRequest('Valid documentId required');

  const supabase = await createSupabaseServerClient();

  const doc = await loadDocumentHead(supabase, documentId);
  if (!doc) return apiError.notFound('Document not found');

  const reviewer = await requireApprovedReviewer(user, doc.organization_id, supabase);
  if (!reviewer) return apiError.forbidden('Only approved reviewers of this organization can view evidence');

  const { data, error } = await supabase
    .from('document_metadata')
    .select('verification_details, ai_confidence_score')
    .eq('document_id', documentId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('Evidence fetch error:', error);
    return apiError.internal('Failed to fetch evidence');
  }
  if (!data) return success({});

  const row = data as Record<string, unknown>;
  const details = (row.verification_details as Record<string, unknown> | null) || {};
  return success({
    qr: details.qr || null,
    mrz: details.mrz || null,
    logo: details.logo || null,
    policy: details.policy || null,
    extracted: details.extracted || null,
    review: details.review || null,
    confidence: row.ai_confidence_score ?? undefined,
  });
});
