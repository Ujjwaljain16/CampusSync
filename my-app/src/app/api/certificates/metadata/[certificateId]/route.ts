import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient, requireRole } from '../../../../../../lib/supabaseServer';

export async function GET(_req: NextRequest, context: { params: Promise<{ certificateId: string }> }) {
  try {
    const auth = await requireRole(['student', 'faculty', 'admin']);
    
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.message }, { status: auth.status });
    }

    const { certificateId } = await context.params;
    const supabase = await createSupabaseServerClient();
    
    // For students, verify they own this certificate
    if (auth.role === 'student') {
      const { data: certificate, error: certError } = await supabase
        .from('certificates')
        .select('student_id')
        .eq('id', certificateId)
        .single();
      
      if (certError || !certificate) {
        return NextResponse.json({ error: 'Certificate not found' }, { status: 404 });
      }
      
      if (certificate.student_id !== auth.user.id) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
      }
    }

    const { data, error } = await supabase
      .from('certificate_metadata')
      .select('*')
      .eq('certificate_id', certificateId)
      .single();

    // Handle case where no metadata exists yet (not an error)
    if (error && error.code === 'PGRST116') {
      return NextResponse.json({ data: null });
    }
    
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    
    return NextResponse.json({ data });
  
  } catch (error: any) {
    console.error('Metadata API error:', error);
    console.error('Error stack:', error.stack);
    return NextResponse.json({ 
      error: error.message || 'Internal server error',
      details: error.toString(),
      stack: error.stack 
    }, { status: 500 });
  }
}


