import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabaseServer';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
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
      return NextResponse.json({ error: error.message }, { status: 500 });
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

    return NextResponse.json({
      data: portfolioData,
      user_id: userId,
      total_credentials: portfolioData.length,
      last_updated: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('Portfolio fetch error:', error);
    return NextResponse.json({ 
      error: error.message || 'Internal server error' 
    }, { status: 500 });
  }
}