// Unified document status API (reviewer-facing, organization-scoped)
import { NextRequest } from 'next/server';
import { withRole, success, apiError, isValidUUID, getOrganizationContext, getTargetOrganizationIds } from '@/lib/api';
import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabaseServer';

const REVIEWER_ROLES = ['faculty', 'admin', 'org_admin', 'super_admin'];
const MAX_BATCH = 50;

const DOC_SELECT = `
  id,
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

export const GET = withRole(REVIEWER_ROLES, async (request: NextRequest, { user }) => {
  const { searchParams } = new URL(request.url);
  const documentId = searchParams.get('documentId');
  if (!documentId || !isValidUUID(documentId)) {
    throw apiError.badRequest('Valid document ID required');
  }

  const supabase = await createSupabaseServerClient();
  const orgContext = await getOrganizationContext(user);
  const targetOrgIds = getTargetOrganizationIds(orgContext);

  const { data: document, error: docError } = await supabase
    .from('documents')
    .select(DOC_SELECT)
    .eq('id', documentId)
    .in('organization_id', targetOrgIds)
    .single();

  if (docError || !document) {
    throw apiError.notFound('Document not found');
  }

  // Authorization for this document is established above; audit_logs may be
  // restricted by RLS, so read it with the service client for this document only.
  let auditLogs: unknown[] = [];
  try {
    const admin = await createSupabaseAdminClient();
    const { data } = await admin
      .from('audit_logs')
      .select('action, details, created_at')
      .eq('target_id', documentId)
      .order('created_at', { ascending: false })
      .limit(10);
    auditLogs = data || [];
  } catch (auditError) {
    console.error('Audit logs fetch error:', auditError);
  }

  return success({
    documentId: document.id,
    type: document.document_type,
    title: document.title,
    institution: document.institution,
    status: document.verification_status,
    confidence: document.document_metadata?.[0]?.ai_confidence_score,
    details: document.document_metadata?.[0]?.verification_details,
    createdAt: document.created_at,
    updatedAt: document.updated_at,
    auditTrail: auditLogs
  });
});

export const POST = withRole(REVIEWER_ROLES, async (request: NextRequest, { user }) => {
  const body = await request.json().catch(() => null) as { documentIds?: unknown } | null;
  const documentIds = body?.documentIds;

  if (!Array.isArray(documentIds) || documentIds.length === 0) {
    throw apiError.badRequest('Document IDs array required');
  }
  if (documentIds.length > MAX_BATCH || !documentIds.every((id) => typeof id === 'string' && isValidUUID(id))) {
    throw apiError.badRequest(`Provide up to ${MAX_BATCH} valid document IDs`);
  }

  const supabase = await createSupabaseServerClient();
  const orgContext = await getOrganizationContext(user);
  const targetOrgIds = getTargetOrganizationIds(orgContext);

  const { data: documents, error: docError } = await supabase
    .from('documents')
    .select(`
      id,
      document_type,
      title,
      institution,
      verification_status,
      created_at,
      updated_at,
      document_metadata (
        ai_confidence_score,
        verification_details
      )
    `)
    .in('id', documentIds as string[])
    .in('organization_id', targetOrgIds);

  if (docError) {
    console.error('Documents fetch error:', docError);
    throw apiError.internal('Failed to fetch documents');
  }

  const statuses = (documents || []).map(doc => ({
    documentId: doc.id,
    type: doc.document_type,
    title: doc.title,
    institution: doc.institution,
    status: doc.verification_status,
    confidence: doc.document_metadata?.[0]?.ai_confidence_score,
    details: doc.document_metadata?.[0]?.verification_details,
    createdAt: doc.created_at,
    updatedAt: doc.updated_at
  }));

  return success({ documents: statuses });
});
