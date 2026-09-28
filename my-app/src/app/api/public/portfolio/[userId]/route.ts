import { NextRequest } from 'next/server';
import { success, apiError, isValidUUID } from '@/lib/api';
import { enforceRateLimit, RateLimitPresets } from '@/lib/rateLimit';
import { createSupabaseServerClient } from '@/lib/supabaseServer';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const limited = enforceRateLimit(request, 'public-portfolio', RateLimitPresets.relaxed);
  if (limited) return limited;

  const { userId } = await params;
  if (!isValidUUID(userId)) throw apiError.badRequest('Invalid user id');
  const supabase = await createSupabaseServerClient();
  
  // Get organization_id from query param (optional - for organization-scoped public portfolios)
  const { searchParams } = new URL(request.url);
  const organizationId = searchParams.get('organizationId');
  if (organizationId && !isValidUUID(organizationId)) throw apiError.badRequest('Invalid organization id');

  // Build query for user's verified certificates
  let query = supabase
    .from('certificates')
    .select('id, title, institution, date_issued, description, verification_status, confidence_score')
    .eq('student_id', userId)
    .eq('verification_status', 'verified');
  
  // If organizationId is provided, filter by it (for org-scoped public viewing)
  if (organizationId) {
    query = query.eq('organization_id', organizationId);
  }
  
  const { data: certificates, error } = await query.order('created_at', { ascending: false });

  if (error) {
    console.error('Public portfolio query failed:', error);
    throw apiError.internal('Failed to load portfolio');
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