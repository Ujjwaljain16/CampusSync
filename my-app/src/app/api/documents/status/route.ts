// Unified document status API (reviewer-facing, organization-scoped)
import { NextRequest } from 'next/server';
import { withAuth, success, apiError, isValidUUID } from '@/lib/api';
import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabaseServer';
import { loadDocumentHead, requireApprovedReviewer } from '@/lib/documents/authz';

const MAX_BATCH = 50;

const DOC_SELECT = `
  id,
  organization_id,
  document_type,
  title,
  institution,
  verification_status,
  created_at,
  updated_at,
  document_metadata (
    ai_confidence_score,
    verification_details,
    created_at,
    updated_at
  )
`;

type MetaRow = { ai_confidence_score?: number; verification_details?: unknown };
function firstMeta(raw: unknown): MetaRow | undefined {
  return (Array.isArray(raw) ? raw[0] : raw) as MetaRow | undefined;
}

export const GET = withAuth(async (request: NextRequest, { user }) => {
  const { searchParams } = new URL(request.url);
  const documentId = searchParams.get('documentId');
  if (!documentId || !isValidUUID(documentId)) {
    return apiError.badRequest('Valid document ID required');
  }

  const supabase = await createSupabaseServerClient();

  const head = await loadDocumentHead(supabase, documentId);
  if (!head) return apiError.notFound('Document not found');

  const reviewer = await requireApprovedReviewer(user, head.organization_id, supabase);
  if (!reviewer) return apiError.forbidden('Only approved reviewers of this organization can view this');

  const { data: document, error: docError } = await supabase
    .from('documents')
    .select(DOC_SELECT)
    .eq('id', documentId)
    .eq('organization_id', head.organization_id)
    .maybeSingle();

  if (docError) {
    console.error('Document status fetch error:', docError);
    return apiError.internal('Failed to fetch document');
  }
  if (!document) return apiError.notFound('Document not found');

  // Authorization for this document is established above; audit_logs may be
  // restricted by RLS, so read it with the service client for this document only.
  let auditLogs: unknown[] = [];
  try {
    const admin = await createSupabaseAdminClient();
    const { data, error } = await admin
      .from('audit_logs')
      .select('action, details, created_at')
      .eq('target_id', documentId)
      .order('created_at', { ascending: false })
      .limit(10);
    if (error) console.error('Audit logs fetch error:', error.message);
    auditLogs = data || [];
  } catch (auditError) {
    console.error('Audit logs fetch error:', auditError);
  }

  const meta = firstMeta((document as { document_metadata?: unknown }).document_metadata);
  return success({
    documentId: document.id,
    type: document.document_type,
    title: document.title,
    institution: document.institution,
    status: document.verification_status,
    confidence: meta?.ai_confidence_score,
    details: meta?.verification_details,
    createdAt: document.created_at,
    updatedAt: document.updated_at,
    auditTrail: auditLogs,
  });
});

export const POST = withAuth(async (request: NextRequest, { user }) => {
  const body = (await request.json().catch(() => null)) as { documentIds?: unknown } | null;
  const documentIds = body?.documentIds;

  if (!Array.isArray(documentIds) || documentIds.length === 0) {
    return apiError.badRequest('Document IDs array required');
  }
  if (documentIds.length > MAX_BATCH || !documentIds.every((id) => typeof id === 'string' && isValidUUID(id))) {
    return apiError.badRequest(`Provide up to ${MAX_BATCH} valid document IDs`);
  }

  const supabase = await createSupabaseServerClient();

  // RLS limits what is returned; each organization is then re-checked for an approved reviewer row
  const { data: documents, error: docError } = await supabase
    .from('documents')
    .select(DOC_SELECT)
    .in('id', documentIds as string[]);

  if (docError) {
    console.error('Documents fetch error:', docError);
    return apiError.internal('Failed to fetch documents');
  }

  const orgAllowed = new Map<string, boolean>();
  const visible: NonNullable<typeof documents> = [];
  for (const doc of documents || []) {
    const orgId = (doc as { organization_id: string }).organization_id;
    if (!orgAllowed.has(orgId)) {
      orgAllowed.set(orgId, !!(await requireApprovedReviewer(user, orgId, supabase)));
    }
    if (orgAllowed.get(orgId)) visible.push(doc);
  }
  if ((documents || []).length > 0 && visible.length === 0) {
    return apiError.forbidden('Only approved reviewers of this organization can view this');
  }

  const statuses = visible.map((doc) => {
    const meta = firstMeta((doc as { document_metadata?: unknown }).document_metadata);
    return {
      documentId: doc.id,
      type: doc.document_type,
      title: doc.title,
      institution: doc.institution,
      status: doc.verification_status,
      confidence: meta?.ai_confidence_score,
      details: meta?.verification_details,
      createdAt: doc.created_at,
      updatedAt: doc.updated_at,
    };
  });

  return success({ documents: statuses });
});
