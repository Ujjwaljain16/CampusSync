import { NextRequest } from 'next/server';
import { createSupabaseServerClient, getServerUserWithRole } from '@/lib/supabaseServer';
import { success, apiError } from '@/lib/api';

export async function GET(_req: NextRequest, context: { params: Promise<{ certificateId: string }> }) {
  const { user, role } = await getServerUserWithRole();
  
  if (!user || !['student', 'faculty', 'admin'].includes(role || '')) {
    throw apiError.unauthorized();
  }

  const { certificateId } = await context.params;
  const supabase = await createSupabaseServerClient();
  
  // For students, verify they own this certificate
  if (role === 'student') {
    const { data: certificate, error: certError } = await supabase
      .from('certificates')
      .select('student_id')
      .eq('id', certificateId)
      .single();
    
    if (certError || !certificate) {
      throw apiError.notFound('Certificate not found');
    }
    
    if (certificate.student_id !== user.id) {
      throw apiError.forbidden();
    }
  }

  const { data, error } = await supabase
    .from('certificate_metadata')
    .select('*')
    .eq('certificate_id', certificateId)
    .single();

  // Handle case where no metadata exists yet (not an error)
  if (error && error.code === 'PGRST116') {
    return success({ data: null });
  }
  
  if (error) {
    throw apiError.internal('Failed to fetch metadata');
  }
  
  return success({ data });
}


