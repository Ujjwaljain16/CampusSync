import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient, getServerUserWithRole } from '@/lib/supabaseServer';

type PipelineStage = 'shortlisted' | 'contacted' | 'interviewed' | 'offered' | 'rejected';

// GET: Fetch all pipeline entries for current recruiter
export async function GET() {
  try {
    const { user, role } = await getServerUserWithRole();
    
    if (!user || (role !== 'recruiter' && role !== 'admin')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createSupabaseAdminClient();
    
    const { data, error } = await supabase
      .from('recruiter_pipeline')
      .select('student_id, stage, notes, updated_at')
      .eq('recruiter_id', user.id)
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('Error fetching pipeline:', error);
      return NextResponse.json({ error: 'Failed to fetch pipeline' }, { status: 500 });
    }

    // Return as map: { studentId: stage }
    const pipeline: Record<string, PipelineStage> = {};
    data?.forEach(entry => {
      pipeline[entry.student_id] = entry.stage as PipelineStage;
    });

    return NextResponse.json({ pipeline });

  } catch (error) {
    console.error('Pipeline GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST: Update pipeline stage for a student
export async function POST(req: NextRequest) {
  try {
    const { user, role } = await getServerUserWithRole();
    
    if (!user || (role !== 'recruiter' && role !== 'admin')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { studentId, stage, notes } = await req.json();
    
    if (!studentId || !stage) {
      return NextResponse.json({ error: 'Student ID and stage required' }, { status: 400 });
    }

    const validStages: PipelineStage[] = ['shortlisted', 'contacted', 'interviewed', 'offered', 'rejected'];
    if (!validStages.includes(stage)) {
      return NextResponse.json({ error: 'Invalid stage' }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();
    
    // Upsert (insert or update)
    const { data, error } = await supabase
      .from('recruiter_pipeline')
      .upsert({
        recruiter_id: user.id,
        student_id: studentId,
        stage,
        notes: notes || null,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'recruiter_id,student_id'
      })
      .select()
      .single();

    if (error) {
      console.error('Error updating pipeline:', error);
      return NextResponse.json({ error: 'Failed to update pipeline' }, { status: 500 });
    }

    return NextResponse.json({ 
      message: 'Pipeline updated',
      pipeline: data
    });

  } catch (error) {
    console.error('Pipeline POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE: Remove a student from pipeline
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
      .from('recruiter_pipeline')
      .delete()
      .eq('recruiter_id', user.id)
      .eq('student_id', studentId);

    if (error) {
      console.error('Error removing from pipeline:', error);
      return NextResponse.json({ error: 'Failed to remove from pipeline' }, { status: 500 });
    }

    return NextResponse.json({ message: 'Removed from pipeline' });

  } catch (error) {
    console.error('Pipeline DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
