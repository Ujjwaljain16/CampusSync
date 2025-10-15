import { NextRequest } from 'next/server';
import { createSupabaseAdminClient, getServerUserWithRole } from '@/lib/supabaseServer';
import { success, apiError } from '@/lib/api';

// GET: Fetch all favorites for current recruiter
export async function GET() {
  const { user, role } = await getServerUserWithRole();
  
  if (!user || (role !== 'recruiter' && role !== 'admin')) {
    throw apiError.unauthorized();
  }

  const supabase = createSupabaseAdminClient();
  
  const { data, error} = await supabase
    .from('recruiter_favorites')
    .select('student_id, created_at')
    .eq('recruiter_id', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching favorites:', error);
    throw apiError.internal('Failed to fetch favorites');
  }

  // Return array of student IDs
  return success({
    favorites: data?.map(f => f.student_id) || []
  });
}

// POST: Add a student to favorites
export async function POST(req: NextRequest) {
  const { user, role } = await getServerUserWithRole();
  
  if (!user || (role !== 'recruiter' && role !== 'admin')) {
    throw apiError.unauthorized();
  }

  const { studentId } = await req.json();
  
  if (!studentId) {
    throw apiError.badRequest('Student ID required');
  }

  const supabase = createSupabaseAdminClient();
  
  // Insert favorite (will fail if already exists due to unique constraint)
  
  const { data, error } = await supabase
    .from('recruiter_favorites')
    .insert({
      recruiter_id: user.id,
      student_id: studentId
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

// DELETE: Remove a student from favorites
export async function DELETE(req: NextRequest) {
  const { user, role } = await getServerUserWithRole();
  
  if (!user || (role !== 'recruiter' && role !== 'admin')) {
    throw apiError.unauthorized();
  }

  const { searchParams } = new URL(req.url);
  const studentId = searchParams.get('studentId');
  
  if (!studentId) {
    throw apiError.badRequest('Student ID required');
  }

  const supabase = createSupabaseAdminClient();
  
  const { error } = await supabase
    .from('recruiter_favorites')
    .delete()
    .eq('recruiter_id', user.id)
    .eq('student_id', studentId);

  if (error) {
    console.error('Error removing favorite:', error);
    throw apiError.internal('Failed to remove favorite');
  }

  return success({ message: 'Removed from favorites' });
}
