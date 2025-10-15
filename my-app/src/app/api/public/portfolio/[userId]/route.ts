import { NextRequest } from 'next/server';
import { success, apiError } from '@/lib/api';
import { createSupabaseServerClient } from '@/lib/supabaseServer';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId } = await params;
  const supabase = await createSupabaseServerClient();

  // Get user's verified certificates/documents
  const { data: certificates, error } = await supabase
    .from('certificates')
    .select('*')
    .eq('student_id', userId)
    .eq('verification_status', 'verified')
    .order('created_at', { ascending: false });

  if (error) {
    throw apiError.internal(error.message);
  }

  // Transform data for portfolio display
  const portfolioData = certificates?.map(cert => ({
    id: cert.id,
    title: cert.title,
    institution: cert.institution,
    date_issued: cert.date_issued,
    description: cert.description,
    verification_status: cert.verification_status,
    confidence_score: cert.confidence_score
  })) || [];

  return success({
    data: portfolioData,
    user_id: userId,
    total_credentials: portfolioData.length,
    last_updated: new Date().toISOString()
  });
}