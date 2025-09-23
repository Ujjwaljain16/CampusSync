import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient, requireRole } from '../../../../../lib/supabaseServer';

export async function GET(_req: NextRequest) {
  try {
    const auth = await requireRole(['faculty', 'admin']);
    
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.message }, { status: auth.status });
    }

    const supabase = await createSupabaseServerClient();

    // Get total certificates count
    const { count: totalCerts } = await supabase
      .from('certificates')
      .select('*', { count: 'exact', head: true });

    // Get auto-approved certificates count
    const { count: autoApprovedCerts } = await supabase
      .from('verification_results')
      .select('*', { count: 'exact', head: true })
      .eq('auto_approved', true);

    // Get pending certificates count
    const { count: pendingCerts } = await supabase
      .from('certificates')
      .select('*', { count: 'exact', head: true })
      .eq('verification_status', 'pending');

    // Get verified certificates count
    const { count: verifiedCerts } = await supabase
      .from('certificates')
      .select('*', { count: 'exact', head: true })
      .eq('verification_status', 'verified');

    // Get rejected certificates count
    const { count: rejectedCerts } = await supabase
      .from('certificates')
      .select('*', { count: 'exact', head: true })
      .eq('verification_status', 'rejected');

    // Get confidence score distribution
    const { data: confidenceData } = await supabase
      .from('verification_results')
      .select('confidence_score, auto_approved')
      .not('confidence_score', 'is', null);

    // Calculate confidence distribution
    const confidenceDistribution = {
      high: confidenceData?.filter(d => d.confidence_score >= 0.9).length || 0,
      medium: confidenceData?.filter(d => d.confidence_score >= 0.7 && d.confidence_score < 0.9).length || 0,
      low: confidenceData?.filter(d => d.confidence_score < 0.7).length || 0,
    };

    // Get verification method distribution
    const { data: verificationData } = await supabase
      .from('verification_results')
      .select('verification_method, auto_approved')
      .not('verification_method', 'is', null);

    const verificationMethods = {
      qr_verified: verificationData?.filter(d => d.verification_method === 'qr_verification').length || 0,
      logo_match: verificationData?.filter(d => d.verification_method === 'logo_match').length || 0,
      template_match: verificationData?.filter(d => d.verification_method === 'template_match').length || 0,
      ai_confidence: verificationData?.filter(d => d.verification_method === 'ai_confidence').length || 0,
      manual_review: verificationData?.filter(d => !d.auto_approved).length || 0,
    };

    // Get recent activity (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data: recentActivity } = await supabase
      .from('certificates')
      .select('created_at, verification_status')
      .gte('created_at', sevenDaysAgo.toISOString())
      .order('created_at', { ascending: false });

    // Calculate daily activity
    const dailyActivity = recentActivity?.reduce((acc, cert) => {
      const date = new Date(cert.created_at).toISOString().split('T')[0];
      if (!acc[date]) {
        acc[date] = { total: 0, verified: 0, pending: 0, rejected: 0 };
      }
      acc[date].total++;
      acc[date][cert.verification_status]++;
      return acc;
    }, {} as Record<string, { total: number; verified: number; pending: number; rejected: number }>) || {};

    // Calculate auto-approval rate
    const autoApprovalRate = totalCerts && totalCerts > 0 
      ? ((autoApprovedCerts || 0) / totalCerts) * 100 
      : 0;

    // Calculate average confidence score
    const avgConfidence = confidenceData && confidenceData.length > 0
      ? confidenceData.reduce((sum, d) => sum + (d.confidence_score || 0), 0) / confidenceData.length
      : 0;

    // Get top institutions
    const { data: institutionData } = await supabase
      .from('certificates')
      .select('institution')
      .not('institution', 'is', null);

    const institutionCounts = institutionData?.reduce((acc, cert) => {
      const inst = cert.institution;
      acc[inst] = (acc[inst] || 0) + 1;
      return acc;
    }, {} as Record<string, number>) || {};

    const topInstitutions = Object.entries(institutionCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([institution, count]) => ({ institution, count }));

    return NextResponse.json({
      data: {
        overview: {
          totalCertificates: totalCerts || 0,
          autoApproved: autoApprovedCerts || 0,
          pending: pendingCerts || 0,
          verified: verifiedCerts || 0,
          rejected: rejectedCerts || 0,
          autoApprovalRate: Math.round(autoApprovalRate * 100) / 100,
          averageConfidence: Math.round(avgConfidence * 100) / 100,
        },
        confidenceDistribution,
        verificationMethods,
        dailyActivity,
        topInstitutions,
      }
    });

  } catch (error: any) {
    console.error('Faculty analytics error:', error);
    return NextResponse.json({ 
      error: error.message || 'Internal server error' 
    }, { status: 500 });
  }
}
