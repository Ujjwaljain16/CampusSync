// Unified document revocation API
import { NextRequest } from 'next/server';
import { withAuth, withRole, success, apiError, parseAndValidateBody, isValidUUID, getOrganizationContext, getTargetOrganizationIds } from '@/lib/api';
import { createSupabaseServerClient } from '@/lib/supabaseServer';

interface RevokeDocumentBody {
  documentId: string;
  reason: string;
  revokedBy?: string;
}

export const POST = withRole(['faculty', 'admin', 'org_admin', 'super_admin'], async (req: NextRequest, { user }) => {
  const result = await parseAndValidateBody<RevokeDocumentBody>(req, ['documentId', 'reason']);
  if (result.error) return result.error;

  const { documentId, reason } = result.data;
  // Never trust a client-supplied "revokedBy"; attribute to the authenticated user
  const revokedBy = user.id;
  if (!isValidUUID(documentId) || typeof reason !== 'string' || reason.length > 1000) {
    throw apiError.badRequest('Invalid documentId or reason');
  }
  const supabase = await createSupabaseServerClient();

  // Document must belong to the caller's organization
  const orgContext = await getOrganizationContext(user);
  const targetOrgIds = getTargetOrganizationIds(orgContext);
  const { data: target } = await supabase
    .from('documents')
    .select('id')
    .eq('id', documentId)
    .in('organization_id', targetOrgIds)
    .maybeSingle();
  if (!target) throw apiError.notFound('Document not found');

  // Update document verification status to revoked
  const { error: updateError } = await supabase
    .from('documents')
    .update({
      verification_status: 'revoked',
      updated_at: new Date().toISOString()
    })
    .eq('id', documentId)
    .in('organization_id', targetOrgIds);

  if (updateError) {
    console.error('Document update error:', updateError);
    throw apiError.internal('Failed to revoke document');
  }

  // Update document metadata with revocation details
  try {
    await supabase.from('document_metadata').upsert({
      document_id: documentId,
      verification_details: { 
        revoked: true, 
        reason, 
        revoked_by: revokedBy,
        revoked_at: new Date().toISOString() 
      },
      updated_at: new Date().toISOString()
    });
  } catch (metadataError) {
    console.error('Metadata update error:', metadataError);
    // Don't fail the request, just log the error
  }

  // Log audit entry
  try {
    await supabase.from('audit_logs').insert({
      actor_id: user.id,
      target_id: documentId,
      action: 'revoke_document',
      details: { reason, revoked_by: revokedBy },
      created_at: new Date().toISOString()
    });
  } catch (auditError) {
    console.error('Audit log error:', auditError);
    // Don't fail the request, just log the error
  }

  return success({
    success: true,
    documentId,
    status: 'revoked'
  }, 'Document revoked successfully');
});

export const GET = withAuth(async (req: NextRequest, { user }) => {
  const { searchParams } = new URL(req.url);
  const documentId = searchParams.get('documentId');

  if (!documentId || !isValidUUID(documentId)) {
    throw apiError.badRequest('Valid document ID required');
  }

  const supabase = await createSupabaseServerClient();
  const orgContext = await getOrganizationContext(user);
  const targetOrgIds = getTargetOrganizationIds(orgContext);

  // Check if document is revoked
  const { data: document, error: docError } = await supabase
    .from('documents')
    .select(`
      id,
      student_id,
      verification_status,
      document_metadata (
        verification_details
      )
    `)
    .eq('id', documentId)
    .in('organization_id', targetOrgIds)
    .single();

  if (docError || !document) {
    throw apiError.notFound('Document not found');
  }
  if (orgContext.role === 'student' && document.student_id !== user.id) {
    throw apiError.forbidden('You do not have permission to view this document');
  }

  const isRevoked = document.verification_status === 'revoked';
  const metadata = document.document_metadata as Array<{ verification_details?: unknown }> | undefined;
  const revocationDetails = metadata?.[0]?.verification_details as Record<string, unknown> | null;

  return success({
    documentId,
    isRevoked,
    status: document.verification_status,
    revocationDetails: isRevoked ? revocationDetails : null
  }, 'Document revocation status retrieved');
});
