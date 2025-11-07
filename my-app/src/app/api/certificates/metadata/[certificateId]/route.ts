import { NextRequest } from 'next/server';
import { createSupabaseServerClient, getServerUserWithRole } from '@/lib/supabaseServer';
import { success, apiError } from '@/lib/api';

export async function GET(_req: NextRequest, context: { params: Promise<{ certificateId: string }> }) {
  const userWithRole = await getServerUserWithRole();
  
  if (!userWithRole) {
    throw apiError.unauthorized();
  }

  const { user, role } = userWithRole;
  
  if (!['student', 'faculty', 'admin'].includes(role || '')) {
    throw apiError.unauthorized();
  }

  const { certificateId } = await context.params;
  const supabase = await createSupabaseServerClient();
  
  // First, get the certificate itself which may have confidence_score stored directly
  const { data: certificate, error: certError } = await supabase
    .from('certificates')
    .select('*')
    .eq('id', certificateId)
    .single();
  
  if (certError || !certificate) {
    throw apiError.notFound('Certificate not found');
  }
  
  // For students, verify they own this certificate
  if (role === 'student' && certificate.student_id !== user.id) {
    throw apiError.forbidden();
  }

  // Try to fetch from certificate_metadata table
  const { data: metadata, error: metadataError } = await supabase
    .from('certificate_metadata')
    .select('*')
    .eq('certificate_id', certificateId)
    .maybeSingle();

  // If metadata exists in separate table, use it
  if (metadata && !metadataError) {
    return success({ data: metadata });
  }
  
  // Otherwise, construct metadata from certificate fields
  const constructedMetadata = {
    certificate_id: certificate.id,
    ai_confidence_score: certificate.confidence_score || 0,
    verification_details: certificate.verification_details || {},
    auto_approved: certificate.auto_approved || false,
    verification_method: certificate.verification_method || null,
    created_at: certificate.created_at,
  };
  
  return success({ data: constructedMetadata });
}


