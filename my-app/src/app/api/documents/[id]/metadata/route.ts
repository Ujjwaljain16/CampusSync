import { NextRequest } from 'next/server';
import { withAuth, success, apiError, isValidUUID } from '@/lib/api';
import { createSupabaseServerClient } from '@/lib/supabaseServer';
import {
  isOwner,
  isPlainObject,
  loadDocumentHead,
  normalizeConfidence,
  requireApprovedReviewer,
  upsertMetadataMerged,
  withinJsonSize,
  writeAuditLog,
} from '@/lib/documents/authz';

type RouteContext = { params: Promise<{ id: string }> };

const MAX_JSON_BYTES = 50_000;

// GET /api/documents/[id]/metadata - owner or approved reviewer
export function GET(req: NextRequest, routeCtx: RouteContext) {
  return withAuth(async (_r, { user }) => {
    const { id } = await routeCtx.params;
    if (!isValidUUID(id)) return apiError.badRequest('Invalid document ID');

    const supabase = await createSupabaseServerClient();
    const head = await loadDocumentHead(supabase, id);
    if (!head) return apiError.notFound('Document not found');

    if (!isOwner(head, user.id)) {
      const reviewer = await requireApprovedReviewer(user, head.organization_id, supabase);
      if (!reviewer) return apiError.forbidden('You do not have permission to view this document');
    }

    const { data, error } = await supabase
      .from('document_metadata')
      .select('*')
      .eq('document_id', id)
      .maybeSingle();

    if (error) {
      console.error('Document metadata fetch error:', error);
      return apiError.internal('Failed to fetch document metadata');
    }

    return success(data || null);
  })(req);
}

// POST /api/documents/[id]/metadata - approved reviewers only (scores must not be self-reported)
export function POST(req: NextRequest, routeCtx: RouteContext) {
  return withAuth(async (r, { user }) => {
    const { id } = await routeCtx.params;
    if (!isValidUUID(id)) return apiError.badRequest('Invalid document ID');

    const supabase = await createSupabaseServerClient();
    const head = await loadDocumentHead(supabase, id);
    if (!head) return apiError.notFound('Document not found');

    const reviewer = await requireApprovedReviewer(user, head.organization_id, supabase);
    if (!reviewer) return apiError.forbidden('Only approved faculty or admins of this organization can update document metadata');

    const body = (await r.json().catch(() => null)) as Record<string, unknown> | null;
    if (!isPlainObject(body)) return apiError.badRequest('Invalid JSON body');

    let confidence: number | null | undefined;
    if (body.ai_confidence_score !== undefined && body.ai_confidence_score !== null) {
      const c = normalizeConfidence(body.ai_confidence_score);
      if (c === null) return apiError.badRequest('ai_confidence_score must be a number between 0 and 100');
      confidence = c;
    } else if (body.ai_confidence_score === null) {
      confidence = null;
    }

    if (body.verification_details !== undefined && !isPlainObject(body.verification_details)) {
      return apiError.badRequest('verification_details must be an object');
    }
    if (body.extracted_fields !== undefined && body.extracted_fields !== null && typeof body.extracted_fields !== 'object') {
      return apiError.badRequest('extracted_fields must be an object');
    }
    if (!withinJsonSize(body.verification_details, MAX_JSON_BYTES) || !withinJsonSize(body.extracted_fields, MAX_JSON_BYTES)) {
      return apiError.badRequest('Payload too large');
    }
    if (confidence === undefined && body.verification_details === undefined && body.extracted_fields === undefined) {
      return apiError.badRequest('No updatable fields provided');
    }

    const result = await upsertMetadataMerged(supabase, id, {
      ai_confidence_score: confidence,
      extracted_fields: body.extracted_fields,
      detailsPatch: body.verification_details as Record<string, unknown> | undefined,
    });
    if (!result.ok) {
      console.error('Document metadata update error:', result.error);
      return apiError.internal('Failed to update document metadata');
    }

    await writeAuditLog(supabase, {
      actorId: user.id,
      organizationId: head.organization_id,
      action: 'update_document_metadata',
      targetId: id,
      details: {
        fields: ['ai_confidence_score', 'verification_details', 'extracted_fields'].filter((k) => body[k] !== undefined),
        ai_confidence_score: confidence ?? null,
      },
    });

    return success(result.data ?? null);
  })(req);
}
