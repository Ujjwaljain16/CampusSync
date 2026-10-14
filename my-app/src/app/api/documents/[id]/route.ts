import { NextRequest } from 'next/server';
import { success, apiError, error as apiErrorResponse, isValidUUID, withAuth } from '@/lib/api';
import { createSupabaseServerClient } from '@/lib/supabaseServer';
import {
  OWNER_EDITABLE_STATUSES,
  DOCUMENT_STATUSES,
  canTransition,
  isOwner,
  isPlainObject,
  loadDocumentHead,
  requireApprovedReviewer,
  withinJsonSize,
  writeAuditLog,
} from '@/lib/documents/authz';

type RouteContext = { params: Promise<{ id: string }> };

const DETAIL_COLUMNS =
  'id, student_id, user_id, organization_id, document_type, title, institution, issue_date, file_url, ocr_text, ocr_confidence, verification_status, metadata, created_at, updated_at';

const MAX_TITLE = 300;
const MAX_METADATA_BYTES = 20_000;
const MAX_REASON = 1000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}(T[\d:.+\-Z]+)?$/;

const AUDIT_ACTION: Record<string, string> = {
  verified: 'verify_document',
  rejected: 'reject_document',
  pending: 'reopen_document',
  revoked: 'revoke_document',
};

function withParams(
  handler: (req: NextRequest, ctx: { user: import('@supabase/supabase-js').User; id: string }) => Promise<Response>
) {
  return (req: NextRequest, routeCtx: RouteContext) =>
    withAuth(async (r, { user }) => {
      const { id } = await routeCtx.params;
      if (!isValidUUID(id)) return apiError.badRequest('Invalid document ID');
      return handler(r, { user, id });
    })(req);
}

// GET /api/documents/[id] - owner or approved reviewer of the document's organization
export const GET = withParams(async (_req, { user, id }) => {
  const supabase = await createSupabaseServerClient();

  const head = await loadDocumentHead(supabase, id);
  if (!head) return apiError.notFound('Document not found');

  if (!isOwner(head, user.id)) {
    const reviewer = await requireApprovedReviewer(user, head.organization_id, supabase);
    if (!reviewer) return apiError.forbidden('You do not have permission to view this document');
  }

  const { data, error } = await supabase
    .from('documents')
    .select(DETAIL_COLUMNS)
    .eq('id', id)
    .eq('organization_id', head.organization_id)
    .maybeSingle();

  if (error) {
    console.error('Document fetch error:', error);
    return apiError.internal('Failed to fetch document');
  }
  if (!data) return apiError.notFound('Document not found');

  return success(data);
});

// PATCH /api/documents/[id]
//  - owner: edit title/institution/issue_date/metadata while status is pending or rejected
//    (editing a rejected document resets it to pending)
//  - approved reviewer: change verification_status through the defined transitions only
export const PATCH = withParams(async (req, { user, id }) => {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!isPlainObject(body)) return apiError.badRequest('Invalid JSON body');

  const supabase = await createSupabaseServerClient();

  const head = await loadDocumentHead(supabase, id);
  if (!head) return apiError.notFound('Document not found');

  const owner = isOwner(head, user.id);
  const contentKeys = ['title', 'institution', 'issue_date', 'metadata'].filter((k) => body[k] !== undefined);
  const wantsStatus = body.verification_status !== undefined;

  if (wantsStatus && contentKeys.length > 0) {
    return apiError.badRequest('Change either document content or verification status, not both');
  }
  if (!wantsStatus && contentKeys.length === 0) {
    return apiError.badRequest('No updatable fields provided');
  }

  // ---------- Reviewer: status transition ----------
  if (wantsStatus) {
    const to = body.verification_status;
    if (typeof to !== 'string' || !DOCUMENT_STATUSES.includes(to as never)) {
      return apiError.badRequest('Invalid verification status');
    }
    const reviewer = await requireApprovedReviewer(user, head.organization_id, supabase);
    if (!reviewer) return apiError.forbidden('You do not have permission to change verification status');

    const reason = body.reason;
    if (reason !== undefined && reason !== null && (typeof reason !== 'string' || reason.length > MAX_REASON)) {
      return apiError.badRequest(`reason must be a string up to ${MAX_REASON} characters`);
    }
    if (to === 'verified' && owner) {
      return apiError.forbidden('You cannot verify your own document');
    }
    if (to === 'rejected' && !(typeof reason === 'string' && reason.trim())) {
      return apiError.badRequest('A reason is required to reject a document');
    }

    const from = head.verification_status;
    if (!canTransition(from, to, reviewer.role)) {
      return apiErrorResponse(`Cannot change status from '${from}' to '${to}'`, 409);
    }

    const { data: updated, error } = await supabase
      .from('documents')
      .update({ verification_status: to, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('organization_id', head.organization_id)
      .eq('verification_status', from)
      .select('id');
    if (error) {
      console.error('Document update error:', error);
      return apiError.internal('Failed to update document');
    }
    if (!updated || updated.length === 0) {
      return apiErrorResponse('Document status changed concurrently; reload and retry', 409);
    }

    await writeAuditLog(supabase, {
      actorId: user.id,
      organizationId: head.organization_id,
      action: AUDIT_ACTION[to],
      targetId: id,
      details: { from_status: from, to_status: to, reason: typeof reason === 'string' ? reason.trim() : null, via: 'patch' },
    });

    return success({ id, verification_status: to, previous_status: from });
  }

  // ---------- Owner: content edit ----------
  if (!owner) return apiError.forbidden('You do not have permission to update this document');

  const from = head.verification_status;
  if (!OWNER_EDITABLE_STATUSES.includes(from)) {
    return apiErrorResponse(`A ${from} document can no longer be edited`, 409);
  }

  const updates: Record<string, unknown> = {};
  if (body.title !== undefined) {
    if (typeof body.title !== 'string' || !body.title.trim() || body.title.length > MAX_TITLE) {
      return apiError.badRequest(`title must be a non-empty string up to ${MAX_TITLE} characters`);
    }
    updates.title = body.title.trim();
  }
  if (body.institution !== undefined) {
    if (body.institution !== null && (typeof body.institution !== 'string' || body.institution.length > MAX_TITLE)) {
      return apiError.badRequest(`institution must be a string up to ${MAX_TITLE} characters`);
    }
    updates.institution = body.institution;
  }
  if (body.issue_date !== undefined) {
    if (body.issue_date !== null && (typeof body.issue_date !== 'string' || !DATE_RE.test(body.issue_date))) {
      return apiError.badRequest('issue_date must be an ISO date (YYYY-MM-DD)');
    }
    updates.issue_date = body.issue_date;
  }
  if (body.metadata !== undefined) {
    if (body.metadata !== null && (!isPlainObject(body.metadata) || !withinJsonSize(body.metadata, MAX_METADATA_BYTES))) {
      return apiError.badRequest('metadata must be a JSON object under 20KB');
    }
    updates.metadata = body.metadata;
  }

  // Editing a rejected document sends it back for review
  const to = from === 'rejected' ? 'pending' : from;
  updates.verification_status = to;
  updates.updated_at = new Date().toISOString();

  const { data: updated, error } = await supabase
    .from('documents')
    .update(updates)
    .eq('id', id)
    .eq('organization_id', head.organization_id)
    .eq('verification_status', from)
    .select(DETAIL_COLUMNS);

  if (error) {
    console.error('Document update error:', error);
    return apiError.internal('Failed to update document');
  }
  if (!updated || updated.length === 0) {
    return apiErrorResponse('Document status changed concurrently; reload and retry', 409);
  }

  await writeAuditLog(supabase, {
    actorId: user.id,
    organizationId: head.organization_id,
    action: 'edit_document',
    targetId: id,
    details: { fields: contentKeys, from_status: from, to_status: to },
  });

  return success(updated[0]);
});
