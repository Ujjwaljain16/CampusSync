// Unified document revocation API
import { NextRequest } from 'next/server';
import { withAuth, success, apiError, error as apiErrorResponse, isValidUUID } from '@/lib/api';
import { createSupabaseServerClient } from '@/lib/supabaseServer';
import {
  canTransition,
  isOwner,
  loadDocumentHead,
  requireApprovedReviewer,
  upsertMetadataMerged,
  writeAuditLog,
} from '@/lib/documents/authz';

const MAX_REASON = 1000;

// POST /api/documents/revoke - approved reviewers of the document's organization only
export const POST = withAuth(async (req: NextRequest, { user }) => {
  const body = (await req.json().catch(() => null)) as { documentId?: unknown; reason?: unknown } | null;
  if (!body || typeof body !== 'object') return apiError.badRequest('Invalid JSON body');

  const { documentId, reason } = body;
  if (
    typeof documentId !== 'string' ||
    !isValidUUID(documentId) ||
    typeof reason !== 'string' ||
    reason.trim().length === 0 ||
    reason.length > MAX_REASON
  ) {
    return apiError.badRequest('Invalid documentId or reason');
  }
  const cleanReason = reason.trim();

  const supabase = await createSupabaseServerClient();

  const doc = await loadDocumentHead(supabase, documentId);
  if (!doc) return apiError.notFound('Document not found');

  const reviewer = await requireApprovedReviewer(user, doc.organization_id, supabase);
  if (!reviewer) return apiError.forbidden('Only approved faculty or admins of this organization can revoke documents');

  const from = doc.verification_status;
  if (!canTransition(from, 'revoked', reviewer.role)) {
    return apiErrorResponse(`Cannot revoke a document that is '${from}'`, 409);
  }

  const { data: updated, error: updateError } = await supabase
    .from('documents')
    .update({ verification_status: 'revoked', updated_at: new Date().toISOString() })
    .eq('id', documentId)
    .eq('organization_id', doc.organization_id)
    .eq('verification_status', from)
    .select('id');

  if (updateError) {
    console.error('Document update error:', updateError);
    return apiError.internal('Failed to revoke document');
  }
  if (!updated || updated.length === 0) {
    return apiErrorResponse('Document status changed concurrently; reload and retry', 409);
  }

  // Record revocation details, keeping any verification evidence already stored
  const metaResult = await upsertMetadataMerged(supabase, documentId, {
    detailsPatch: {
      revoked: true,
      reason: cleanReason,
      revoked_by: user.id, // never trust a client-supplied "revokedBy"
      revoked_at: new Date().toISOString(),
    },
  });
  if (!metaResult.ok) console.error('Metadata update error:', metaResult.error);

  await writeAuditLog(supabase, {
    actorId: user.id,
    organizationId: doc.organization_id,
    action: 'revoke_document',
    targetId: documentId,
    details: { from_status: from, to_status: 'revoked', reason: cleanReason, revoked_by: user.id },
  });

  return success(
    { success: true, documentId, status: 'revoked', metadataUpdated: metaResult.ok },
    'Document revoked successfully'
  );
});

// GET /api/documents/revoke?documentId=... - document owner or approved reviewer
export const GET = withAuth(async (req: NextRequest, { user }) => {
  const { searchParams } = new URL(req.url);
  const documentId = searchParams.get('documentId');
  if (!documentId || !isValidUUID(documentId)) {
    return apiError.badRequest('Valid document ID required');
  }

  const supabase = await createSupabaseServerClient();

  const head = await loadDocumentHead(supabase, documentId);
  if (!head) return apiError.notFound('Document not found');

  const owner = isOwner(head, user.id);
  const reviewer = owner ? null : await requireApprovedReviewer(user, head.organization_id, supabase);
  if (!owner && !reviewer) {
    return apiError.forbidden('You do not have permission to view this document');
  }

  const isRevoked = head.verification_status === 'revoked';
  let revocationDetails: Record<string, unknown> | null = null;

  if (isRevoked) {
    const { data: meta } = await supabase
      .from('document_metadata')
      .select('verification_details')
      .eq('document_id', documentId)
      .maybeSingle();
    const d = (meta as { verification_details?: Record<string, unknown> } | null)?.verification_details;
    if (d && typeof d === 'object') {
      // Only expose the revocation fields, not the rest of the verification evidence
      revocationDetails = {
        revoked: d.revoked ?? true,
        reason: d.reason ?? null,
        revoked_at: d.revoked_at ?? null,
        ...(reviewer ? { revoked_by: d.revoked_by ?? null } : {}),
      };
    }
  }

  return success(
    {
      documentId,
      isRevoked,
      status: head.verification_status,
      revocationDetails,
    },
    'Document revocation status retrieved'
  );
});
