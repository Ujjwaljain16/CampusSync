import { NextRequest } from 'next/server';
import { success, apiError, getOrganizationContext, getTargetOrganizationIds } from '@/lib/api';
import { createSupabaseServerClient } from '@/lib/supabaseServer';

// GET /api/documents/[id]

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  
  // Get authenticated user
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    throw apiError.unauthorized('Authentication required');
  }
  
  // Get organization context for multi-tenancy
  const orgContext = await getOrganizationContext(user);
  const targetOrgIds = getTargetOrganizationIds(orgContext);
  
  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .eq('id', id)
    .in('organization_id', targetOrgIds) // Multi-org filter
    .single();
    
  if (error) throw apiError.notFound('Document not found');
  
  // Additional check: students can only see their own documents
  if (orgContext.role === 'student' && data.student_id !== user.id) {
    throw apiError.forbidden('You do not have permission to view this document');
  }
  
  return success(data);
}

// PATCH /api/documents/[id]

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  
  // Get authenticated user
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    throw apiError.unauthorized('Authentication required');
  }
  
  // Get organization context for multi-tenancy
  const orgContext = await getOrganizationContext(user);
  const targetOrgIds = getTargetOrganizationIds(orgContext);
  
  // First verify the document exists and belongs to user's organization
  const { data: existingDoc, error: fetchError } = await supabase
    .from('documents')
    .select('student_id, organization_id')
    .eq('id', id)
    .in('organization_id', targetOrgIds)
    .single();
    
  if (fetchError || !existingDoc) {
    throw apiError.notFound('Document not found');
  }
  
  // Students can only update their own documents
  if (orgContext.role === 'student' && existingDoc.student_id !== user.id) {
    throw apiError.forbidden('You do not have permission to update this document');
  }
  
  const body = await req.json();
  const { data, error } = await supabase
    .from('documents')
    .update({
      title: body.title,
      institution: body.institution,
      issue_date: body.issue_date,
      verification_status: body.verification_status,
      metadata: body.metadata
    })
    .eq('id', id)
    .in('organization_id', targetOrgIds) // Ensure org match
    .select()
    .single();
    
  if (error) throw apiError.internal(error.message);
  return success(data);
}


