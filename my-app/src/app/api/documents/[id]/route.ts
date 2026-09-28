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
  
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') throw apiError.badRequest('Invalid JSON body');

  const updates: Record<string, unknown> = {
    title: body.title,
    institution: body.institution,
    issue_date: body.issue_date,
    metadata: body.metadata
  };
  // Only reviewers may change verification status (students must not self-verify)
  if (body.verification_status !== undefined) {
    if (!['faculty', 'admin', 'org_admin', 'super_admin'].includes(orgContext.role)) {
      throw apiError.forbidden('You do not have permission to change verification status');
    }
    if (!['pending', 'verified', 'rejected'].includes(body.verification_status)) {
      throw apiError.badRequest('Invalid verification status');
    }
    updates.verification_status = body.verification_status;
  }

  const { data, error } = await supabase
    .from('documents')
    .update(updates)
    .eq('id', id)
    .in('organization_id', targetOrgIds) // Ensure org match
    .select()
    .single();
    
  if (error) {
    console.error('Document update error:', error);
    throw apiError.internal('Failed to update document');
  }
  return success(data);
}


