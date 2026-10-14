import { NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { withAuth, success, apiError, isValidUUID, isRecruiterContext, getOrganizationContext } from '@/lib/api';
import {
  DOCUMENT_STATUSES,
  isPlainObject,
  normalizeConfidence,
  requireApprovedReviewer,
  withinJsonSize,
  writeAuditLog,
} from '@/lib/documents/authz';
import { parseStoragePublicUrl } from '@/lib/storageUrl';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const MAX_TEXT = 300;
const MAX_OCR_TEXT = 50_000;
const MAX_METADATA_BYTES = 20_000;
const DOCUMENTS_BUCKET = 'certificates';
const DATE_RE = /^\d{4}-\d{2}-\d{2}(T[\d:.+\-Z]+)?$/;

// Explicit columns: never `select('*')`, and no OCR text in list responses
const LIST_COLUMNS =
  'id, student_id, organization_id, document_type, title, institution, issue_date, file_url, ocr_confidence, verification_status, metadata, created_at, updated_at';

function clampInt(raw: string | null, fallback: number, min: number, max: number): number {
  const n = raw === null ? NaN : Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

// GET /api/documents
//  - students: their own documents
//  - approved reviewers (faculty/admin/...): the organization's documents (?scope=mine for own)
//  - everyone else: 403
// Paginated: ?limit (<=100, default 50) & ?offset. Total is returned in X-Total-Count.
export const GET = withAuth(async (req: NextRequest, { user }) => {
  const supabase = await createSupabaseServerClient();

  const orgContext = await getOrganizationContext(user);
  if (isRecruiterContext(orgContext)) {
    return apiError.forbidden('Recruiters cannot list documents here');
  }
  const orgId = orgContext.organizationId;

  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type') || undefined;
  const status = searchParams.get('status') || undefined;
  const studentId = searchParams.get('student_id') || undefined;
  const scopeMine = searchParams.get('scope') === 'mine';
  const limit = clampInt(searchParams.get('limit'), DEFAULT_LIMIT, 1, MAX_LIMIT);
  const offset = clampInt(searchParams.get('offset'), 0, 0, 1_000_000);

  if (status && !DOCUMENT_STATUSES.includes(status as never)) {
    return apiError.badRequest('Invalid status filter');
  }
  if (studentId && !isValidUUID(studentId)) {
    return apiError.badRequest('Invalid student_id');
  }
  if (type && type.length > 64) {
    return apiError.badRequest('Invalid type filter');
  }

  const reviewer = scopeMine ? null : await requireApprovedReviewer(user, orgId, supabase);
  const isStudent = orgContext.role === 'student';
  // Not a reviewer and not a student: nothing to list (scope=mine only ever returns own rows)
  if (!reviewer && !isStudent && !scopeMine) {
    return apiError.forbidden('You do not have permission to list documents');
  }

  let query = supabase
    .from('documents')
    .select(LIST_COLUMNS, { count: 'exact' })
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (reviewer) {
    // Reviewers may narrow to a specific student
    if (studentId) query = query.eq('student_id', studentId);
  } else {
    // Owners only ever see their own rows (student_id filter is ignored)
    query = query.eq('student_id', user.id);
  }

  if (type) query = query.eq('document_type', type);
  if (status) query = query.eq('verification_status', status);

  const { data, error, count } = await query;
  if (error) {
    console.error('Document list error:', error);
    return apiError.internal('Failed to fetch documents');
  }

  const res = success(data ?? []);
  res.headers.set('X-Total-Count', String(count ?? data?.length ?? 0));
  res.headers.set('X-Limit', String(limit));
  res.headers.set('X-Offset', String(offset));
  return res;
});

// POST /api/documents - create a document (the caller creates their own)
export const POST = withAuth(async (req: NextRequest, { user }) => {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!isPlainObject(body)) return apiError.badRequest('Invalid JSON body');

  if (typeof body.document_type !== 'string' || typeof body.title !== 'string' || typeof body.file_url !== 'string') {
    return apiError.badRequest('document_type, title and file_url are required');
  }
  const documentType = body.document_type.trim();
  const title = body.title.trim();
  if (!documentType || documentType.length > 64) return apiError.badRequest('Invalid document_type');
  if (!title || title.length > MAX_TEXT) return apiError.badRequest(`title must be 1-${MAX_TEXT} characters`);

  if (body.institution != null && (typeof body.institution !== 'string' || body.institution.length > MAX_TEXT)) {
    return apiError.badRequest(`institution must be a string up to ${MAX_TEXT} characters`);
  }
  if (body.issue_date != null && (typeof body.issue_date !== 'string' || !DATE_RE.test(body.issue_date))) {
    return apiError.badRequest('issue_date must be an ISO date (YYYY-MM-DD)');
  }
  if (body.ocr_text != null && typeof body.ocr_text !== 'string') {
    return apiError.badRequest('ocr_text must be a string');
  }
  let ocrConfidence: number | null = null;
  if (body.ocr_confidence != null) {
    ocrConfidence = normalizeConfidence(body.ocr_confidence);
    if (ocrConfidence === null) return apiError.badRequest('ocr_confidence must be a number between 0 and 100');
  }
  if (body.metadata != null && (!isPlainObject(body.metadata) || !withinJsonSize(body.metadata, MAX_METADATA_BYTES))) {
    return apiError.badRequest('metadata must be a JSON object under 20KB');
  }

  // The file must be one the caller uploaded to our own storage bucket
  const parsedUrl = parseStoragePublicUrl(body.file_url, {
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    bucket: DOCUMENTS_BUCKET,
    userId: user.id,
  });
  if (!parsedUrl) return apiError.badRequest('file_url must point to a file you uploaded');

  const supabase = await createSupabaseServerClient();

  const orgContext = await getOrganizationContext(user);
  if (isRecruiterContext(orgContext)) {
    return apiError.forbidden('Recruiters cannot create documents');
  }

  const payload = {
    student_id: user.id,
    user_id: user.id,
    organization_id: orgContext.organizationId,
    document_type: documentType,
    title,
    institution: (body.institution as string | null | undefined) || null,
    issue_date: (body.issue_date as string | null | undefined) || null,
    file_url: parsedUrl.url,
    ocr_text: typeof body.ocr_text === 'string' ? body.ocr_text.slice(0, MAX_OCR_TEXT) : null,
    ocr_confidence: ocrConfidence,
    // Owners cannot choose their own verification status
    verification_status: 'pending',
    metadata: (body.metadata as Record<string, unknown> | null | undefined) || null,
  };

  const { data, error } = await supabase.from('documents').insert(payload).select(LIST_COLUMNS).single();

  if (error || !data) {
    console.error('Document create error:', error);
    return apiError.internal('Failed to create document');
  }

  await writeAuditLog(supabase, {
    actorId: user.id,
    organizationId: orgContext.organizationId,
    action: 'create_document',
    targetId: data.id,
    details: { document_type: documentType },
  });

  return success(data, 'Document created successfully', 201);
});
