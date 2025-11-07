import { NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { withAuth, success, apiError, getOrganizationContext, getTargetOrganizationIds } from '@/lib/api';

// GET /api/documents - list current user's documents (or all for admin/faculty/recruiter with filters)
export const GET = withAuth(async (req: NextRequest, { user }) => {
  const supabase = await createSupabaseServerClient();
  
  // Get organization context for multi-tenancy
  const orgContext = await getOrganizationContext(user);
  const targetOrgIds = getTargetOrganizationIds(orgContext);
  
  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type') || undefined;
  const status = searchParams.get('status') || undefined;
  const studentId = searchParams.get('student_id') || undefined;

  const role = orgContext.role;

  let query = supabase
    .from('documents')
    .select('*')
    .in('organization_id', targetOrgIds) // Multi-org filter
    .order('created_at', { ascending: false });

  // Students can only see their own documents
  if (role === 'student') {
    query = query.eq('student_id', user.id);
  } else if (studentId) {
    // Admins/faculty/recruiters can filter by specific student
    query = query.eq('student_id', studentId);
  }
  // Otherwise admins/faculty/recruiters see all documents in their org

  if (type) query = query.eq('document_type', type);
  if (status) query = query.eq('verification_status', status);

  const { data, error } = await query;
  if (error) throw apiError.internal(error.message);
  
  return success(data);
});

// POST /api/documents - create a document (student creates own)
export const POST = withAuth(async (req: NextRequest, { user }) => {
  const supabase = await createSupabaseServerClient();
  const body = await req.json();
  
  // Get organization context for multi-tenancy
  const orgContext = await getOrganizationContext(user);
  const targetOrgIds = getTargetOrganizationIds(orgContext);
  
  const payload = {
    student_id: user.id,
    user_id: user.id,
    organization_id: 'organizationId' in orgContext ? orgContext.organizationId : targetOrgIds[0], // Multi-org support
    document_type: body.document_type,
    title: body.title,
    institution: body.institution || null,
    issue_date: body.issue_date || null,
    file_url: body.file_url,
    ocr_text: body.ocr_text || null,
    ocr_confidence: body.ocr_confidence || null,
    verification_status: body.verification_status || 'pending',
    metadata: body.metadata || null
  };

  const { data, error } = await supabase
    .from('documents')
    .insert(payload)
    .select()
    .single();

  if (error) throw apiError.internal(error.message);
  
  return success(data, 'Document created successfully', 201);
});





