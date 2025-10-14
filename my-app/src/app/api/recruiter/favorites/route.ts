import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient, getServerUserWithRole } from '@/lib/supabaseServer';

// GET: Fetch all favorites for current recruiter
export async function GET() {
  try {
    const { user, role } = await getServerUserWithRole();
    
    if (!user || (role !== 'recruiter' && role !== 'admin')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createSupabaseAdminClient();
    
    const { data, error } = await supabase
      .from('recruiter_favorites')
      .select('student_id, created_at')
      .eq('recruiter_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching favorites:', error);
      return NextResponse.json({ error: 'Failed to fetch favorites' }, { status: 500 });
    }

    // Return array of student IDs
    return NextResponse.json({
      favorites: data?.map(f => f.student_id) || []
    });

  } catch (error) {
    console.error('Favorites GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST: Add a student to favorites
export async function POST(req: NextRequest) {
  try {
    const { user, role } = await getServerUserWithRole();
    
    if (!user || (role !== 'recruiter' && role !== 'admin')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { studentId } = await req.json();
    
    if (!studentId) {
      return NextResponse.json({ error: 'Student ID required' }, { status: 400 });
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
        return NextResponse.json({ 
          message: 'Already in favorites',
          favorite: { student_id: studentId }
        });
      }
      console.error('Error adding favorite:', error);
      return NextResponse.json({ error: 'Failed to add favorite' }, { status: 500 });
    }

    return NextResponse.json({ 
      message: 'Added to favorites',
      favorite: data
    });

  } catch (error) {
    console.error('Favorites POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE: Remove a student from favorites
export async function DELETE(req: NextRequest) {
  try {
    const { user, role } = await getServerUserWithRole();
    
    if (!user || (role !== 'recruiter' && role !== 'admin')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const studentId = searchParams.get('studentId');
    
    if (!studentId) {
      return NextResponse.json({ error: 'Student ID required' }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();
    
    const { error } = await supabase
      .from('recruiter_favorites')
      .delete()
      .eq('recruiter_id', user.id)
      .eq('student_id', studentId);

    if (error) {
      console.error('Error removing favorite:', error);
      return NextResponse.json({ error: 'Failed to remove favorite' }, { status: 500 });
    }

    return NextResponse.json({ message: 'Removed from favorites' });

  } catch (error) {
    console.error('Favorites DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
