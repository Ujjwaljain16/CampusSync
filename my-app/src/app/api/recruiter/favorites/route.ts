import { NextRequest } from 'next/server';
import { createSupabaseAdminClient, getServerUserWithRole } from '@/lib/supabaseServer';
import { success, apiError, getOrganizationContext, getTargetOrganizationIds } from '@/lib/api';
import { getRequestedOrgId } from '@/lib/api/utils/recruiter';

// GET: Fetch all favorites for current recruiter (org-scoped)
export async function GET(req: NextRequest) {
  const userWithRole = await getServerUserWithRole();
  
  if (!userWithRole) {
    throw apiError.unauthorized();
  }
  
  const { user, role } = userWithRole;
  
  if (role !== 'recruiter' && role !== 'admin') {
    throw apiError.unauthorized();
  }

  const supabase = await createSupabaseAdminClient();
  const requestedOrgId = getRequestedOrgId(req);
  const orgContext = await getOrganizationContext(user, requestedOrgId);
  const targetOrgIds = getTargetOrganizationIds(orgContext);
  
  const { data, error} = await supabase
    .from('recruiter_favorites')
    .select('student_id, created_at')
    .eq('recruiter_id', user.id)
    .in('organization_id', targetOrgIds) // Multi-org filter
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching favorites:', error);
    throw apiError.internal('Failed to fetch favorites');
  }

  // Return array of student IDs
  return success({
    favorites: data?.map((f: { student_id: string }) => f.student_id) || []
  });
}

// POST: Add a student to favorites (org-scoped)
export async function POST(req: NextRequest) {
  const userWithRole = await getServerUserWithRole();
  
  if (!userWithRole) {
    throw apiError.unauthorized();
  }
  
  const { user, role } = userWithRole;
  
  if (role !== 'recruiter' && role !== 'admin') {
    throw apiError.unauthorized();
  }

  const { studentId } = await req.json();
  
  if (!studentId) {
    throw apiError.badRequest('Student ID required');
  }

  const supabase = await createSupabaseAdminClient();
  const requestedOrgId = getRequestedOrgId(req);
  const orgContext = await getOrganizationContext(user, requestedOrgId);
  const targetOrgIds = getTargetOrganizationIds(orgContext);
  const targetOrgId = requestedOrgId || ('organizationId' in orgContext ? orgContext.organizationId : targetOrgIds[0]);
  
  // Insert favorite with organization (will fail if already exists due to unique constraint)
  const { data, error } = await supabase
    .from('recruiter_favorites')
    .insert({
      recruiter_id: user.id,
      student_id: studentId,
      organization_id: targetOrgId // Multi-org field
    })
    .select()
    .single();

  if (error) {
    // Check if already exists
    if (error.code === '23505') {
      return success({ 
        message: 'Already in favorites',
        favorite: { student_id: studentId }
      });
    }
    console.error('Error adding favorite:', error);
    throw apiError.internal('Failed to add favorite');
  }

  return success({ 
    message: 'Added to favorites',
    favorite: data
  });
}

// DELETE: Remove a student from favorites (org-scoped)
export async function DELETE(req: NextRequest) {
  const userWithRole = await getServerUserWithRole();
  
  if (!userWithRole) {
    throw apiError.unauthorized();
  }
  
  const { user, role } = userWithRole;
  
  if (role !== 'recruiter' && role !== 'admin') {
    throw apiError.unauthorized();
  }

  const { searchParams } = new URL(req.url);
  const studentId = searchParams.get('studentId');
  
  if (!studentId) {
    throw apiError.badRequest('Student ID required');
  }

  const supabase = await createSupabaseAdminClient();
  const requestedOrgId = getRequestedOrgId(req);
  const orgContext = await getOrganizationContext(user, requestedOrgId);
  const targetOrgIds = getTargetOrganizationIds(orgContext);
  
  const { error } = await supabase
    .from('recruiter_favorites')
    .delete()
    .eq('recruiter_id', user.id)
    .eq('student_id', studentId)
    .in('organization_id', targetOrgIds); // Multi-org filter

  if (error) {
    console.error('Error removing favorite:', error);
    throw apiError.internal('Failed to remove favorite');
  }

  return success({ message: 'Removed from favorites' });
}

