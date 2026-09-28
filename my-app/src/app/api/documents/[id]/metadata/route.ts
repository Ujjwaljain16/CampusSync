import { NextRequest } from 'next/server';
import { success, apiError, isValidUUID, getOrganizationContext, getTargetOrganizationIds } from '@/lib/api';
import { createSupabaseServerClient } from '@/lib/supabaseServer';

const REVIEWER_ROLES = ['faculty', 'admin', 'org_admin', 'super_admin'];

async function authorize(id: string) {
  if (!isValidUUID(id)) throw apiError.badRequest('Invalid document ID');

  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw apiError.unauthorized('Authentication required');

  const orgContext = await getOrganizationContext(user);
  const targetOrgIds = getTargetOrganizationIds(orgContext);

  // Document must be inside the caller's organization(s)
  const { data: document, error: docError } = await supabase
    .from('documents')
    .select('organization_id, student_id')
    .eq('id', id)
    .in('organization_id', targetOrgIds)
    .single();

  if (docError || !document) throw apiError.notFound('Document not found');

  return { supabase, user, orgContext, document };
}

// GET /api/documents/[id]/metadata
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user, orgContext, document } = await authorize(id);

  // Students may only read metadata of their own documents
  if (orgContext.role === 'student' && document.student_id !== user.id) {
    throw apiError.forbidden('You do not have permission to view this document');
  }

  const { data, error } = await supabase
    .from('document_metadata')
    .select('*')
    .eq('document_id', id)
    .maybeSingle();

  if (error && error.code !== 'PGRST116') {
    console.error('Document metadata fetch error:', error);
    throw apiError.internal('Failed to fetch document metadata');
  }

  return success(data || null);
}

// POST /api/documents/[id]/metadata - reviewers only (confidence scores must not be self-reported)
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, orgContext } = await authorize(id);

  if (!REVIEWER_ROLES.includes(orgContext.role)) {
    throw apiError.forbidden('Only faculty or admins can update document metadata');
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') throw apiError.badRequest('Invalid JSON body');

  const { data, error } = await supabase
    .from('document_metadata')
    .upsert({
      document_id: id,
      ai_confidence_score: body.ai_confidence_score,
      verification_details: body.verification_details,
      extracted_fields: body.extracted_fields,
      updated_at: new Date().toISOString()
    }, { onConflict: 'document_id' })
    .select()
    .single();

  if (error) {
    console.error('Document metadata update error:', error);
    throw apiError.internal('Failed to update document metadata');
  }
  return success(data);
}
