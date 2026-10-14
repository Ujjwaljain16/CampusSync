// Unified document verification API
import { NextRequest } from 'next/server';
import { withAuth, success, apiError, error as apiErrorResponse, isValidUUID } from '@/lib/api';
import { createSupabaseServerClient } from '@/lib/supabaseServer';
import {
  canTransition,
  isOwner,
  loadDocumentHead,
  normalizeConfidence,
  requireApprovedReviewer,
  upsertMetadataMerged,
  writeAuditLog,
} from '@/lib/documents/authz';

// 'revoked' has its own endpoint (/api/documents/revoke); everything else goes through here.
const ALLOWED_STATUSES = ['pending', 'verified', 'rejected'];
const MAX_REASON = 1000;

const AUDIT_ACTION: Record<string, string> = {
  verified: 'verify_document',
  rejected: 'reject_document',
  pending: 'reopen_document',
};

interface VerifyDocumentBody {
  documentId?: unknown;
  verificationStatus?: unknown;
  reason?: unknown;
  confidence?: unknown;
}

// POST /api/documents/verify - approved reviewers of the document's organization only
export const POST = withAuth(async (request: NextRequest, { user }) => {
  const body = (await request.json().catch(() => null)) as VerifyDocumentBody | null;
  if (!body || typeof body !== 'object') return apiError.badRequest('Invalid JSON body');

  const { documentId, verificationStatus, reason, confidence } = body;

  if (typeof documentId !== 'string' || !isValidUUID(documentId)) {
    return apiError.badRequest('Invalid document ID format');
  }
  if (typeof verificationStatus !== 'string' || !ALLOWED_STATUSES.includes(verificationStatus)) {
    return apiError.badRequest('Invalid verification status');
  }
  if (reason !== undefined && reason !== null && (typeof reason !== 'string' || reason.length > MAX_REASON)) {
    return apiError.badRequest(`reason must be a string up to ${MAX_REASON} characters`);
  }
  const cleanReason = typeof reason === 'string' ? reason.trim() : '';
  if (verificationStatus === 'rejected' && !cleanReason) {
    return apiError.badRequest('A reason is required to reject a document');
  }

  let normalizedConfidence: number | undefined;
  if (confidence !== undefined && confidence !== null) {
    const c = normalizeConfidence(confidence);
    if (c === null) return apiError.badRequest('confidence must be a number between 0 and 100');
    normalizedConfidence = c;
  }

  const supabase = await createSupabaseServerClient();

  const doc = await loadDocumentHead(supabase, documentId);
  if (!doc) return apiError.notFound('Document not found or access denied');

  const reviewer = await requireApprovedReviewer(user, doc.organization_id, supabase);
  if (!reviewer) return apiError.forbidden('Only approved faculty or admins of this organization can verify documents');

  // Reviewers must not approve their own submissions
  if (verificationStatus === 'verified' && isOwner(doc, user.id)) {
    return apiError.forbidden('You cannot verify your own document');
  }

  const from = doc.verification_status;
  if (!canTransition(from, verificationStatus, reviewer.role)) {
    return apiErrorResponse(`Cannot change status from '${from}' to '${verificationStatus}'`, 409);
  }

  // Conditional update: only succeeds if nobody changed the status in the meantime
  const { data: updated, error: updateError } = await supabase
    .from('documents')
    .update({ verification_status: verificationStatus, updated_at: new Date().toISOString() })
    .eq('id', documentId)
    .eq('organization_id', doc.organization_id)
    .eq('verification_status', from)
    .select('id');

  if (updateError) {
    console.error('Document update error:', updateError);
    return apiError.internal('Failed to update document');
  }
  if (!updated || updated.length === 0) {
    return apiErrorResponse('Document status changed concurrently; reload and retry', 409);
  }

  // Merge review evidence into metadata (never wipe existing verification_details)
  const now = new Date().toISOString();
  const metaResult = await upsertMetadataMerged(supabase, documentId, {
    ai_confidence_score: normalizedConfidence,
    detailsPatch: {
      review: {
        status: verificationStatus,
        reason: cleanReason || null,
        reviewed_by: user.id,
        reviewed_at: now,
      },
      // Re-opening a previously revoked document clears the revocation flag
      ...(from === 'revoked' ? { revoked: false } : {}),
    },
  });
  if (!metaResult.ok) {
    console.error('Metadata update error:', metaResult.error);
  }

  await writeAuditLog(supabase, {
    actorId: user.id,
    organizationId: doc.organization_id,
    action: AUDIT_ACTION[verificationStatus],
    targetId: documentId,
    details: {
      from_status: from,
      to_status: verificationStatus,
      reason: cleanReason || null,
      confidence: normalizedConfidence ?? null,
    },
  });

  return success(
    {
      success: true,
      documentId,
      verificationStatus,
      previousStatus: from,
      metadataUpdated: metaResult.ok,
    },
    'Document verification updated successfully'
  );
});

// GET /api/documents/verify?documentId=... - owner or approved reviewer
export const GET = withAuth(async (request: NextRequest, { user }) => {
  const { searchParams } = new URL(request.url);
  const documentId = searchParams.get('documentId');
  if (!documentId || !isValidUUID(documentId)) {
    return apiError.badRequest('Valid document ID required');
  }

  const supabase = await createSupabaseServerClient();
  const head = await loadDocumentHead(supabase, documentId);
  if (!head) return apiError.notFound('Document not found');

  const owner = isOwner(head, user.id);
  if (!owner) {
    const reviewer = await requireApprovedReviewer(user, head.organization_id, supabase);
    if (!reviewer) return apiError.forbidden('You do not have permission to view this document');
  }

  const { data: document, error: docError } = await supabase
    .from('documents')
    .select(
      `id, student_id, organization_id, document_type, title, institution, issue_date,
       verification_status, created_at, updated_at,
       document_metadata ( ai_confidence_score, verification_details, created_at, updated_at )`
    )
    .eq('id', documentId)
    .eq('organization_id', head.organization_id)
    .maybeSingle();

  if (docError) {
    console.error('Document fetch error:', docError);
    return apiError.internal('Failed to fetch document');
  }
  if (!document) return apiError.notFound('Document not found');

  const rawMeta = (document as { document_metadata?: unknown }).document_metadata;
  const meta = (Array.isArray(rawMeta) ? rawMeta[0] : rawMeta) as
    | { ai_confidence_score?: number; verification_details?: unknown }
    | null
    | undefined;

  return success({
    document,
    verification: {
      status: document.verification_status,
      confidence: meta?.ai_confidence_score,
      details: meta?.verification_details,
    },
  });
});
