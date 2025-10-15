import { NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { withAuth, success, apiError } from '@/lib/api';

// GET /api/documents - list current user's documents (or all for admin/faculty/recruiter with filters)
export const GET = withAuth(async (req: NextRequest, { user }) => {
  const supabase = await createSupabaseServerClient();
  
  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type') || undefined;
  const status = searchParams.get('status') || undefined;
  const studentId = searchParams.get('student_id') || undefined;

  // Determine if requester is privileged
  const { data: roleRow } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .single();

  const role = roleRow?.role || 'student';

  let query = supabase
    .from('documents')
    .select('*')
    .order('created_at', { ascending: false });

  if (role === 'student') {
    query = query.eq('student_id', user.id);
  } else if (studentId) {
    query = query.eq('student_id', studentId);
  }

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
  
  const payload = {
    student_id: user.id,
    user_id: user.id,
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



