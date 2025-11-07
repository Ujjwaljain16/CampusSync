import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient, requireRole, getServerUserWithRole } from '@/lib/supabaseServer';
import { getOrganizationContext } from '@/lib/api'; import { getTargetOrganizationIds } from '@/lib/api';

export async function GET(req: NextRequest) {
  const auth = await requireRole(['admin', 'org_admin', 'super_admin']);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.message || 'Unauthorized' }, { status: 403 });
  }

  const userWithRole = await getServerUserWithRole();
  if (!userWithRole) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  const { user } = userWithRole;

  const supabase = await createSupabaseServerClient();
  const orgContext = await getOrganizationContext(user);
  const targetOrgIds = getTargetOrganizationIds(orgContext);
  const { searchParams } = new URL(req.url);
  const range = searchParams.get('range') || '30d';

  try {
    // Calculate date range
    const now = new Date();
    const days = range === '7d' ? 7 : range === '30d' ? 30 : 90;
    const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

    // Get total certificates with org filter
    let certQuery = supabase
      .from('certificates')
      .select('id, verification_status, created_at')
      .gte('created_at', startDate.toISOString());

    if (!orgContext.isSuperAdmin) {
      certQuery = certQuery.in('organization_id', targetOrgIds);
    }

    const { data: totalCerts, error: totalError } = await certQuery;

    if (totalError) {
      throw new Error('Failed to fetch total certificates');
    }

    // Get verification results (only for certificates in org)
    const certificateIds = totalCerts?.map(c => c.id) || [];
    const { data: verificationResults, error: verError } = certificateIds.length > 0
      ? await supabase
          .from('verification_results')
          .select('certificate_id, is_verified, auto_approved, confidence_score, verification_method, created_at')
          .in('certificate_id', certificateIds)
          .gte('created_at', startDate.toISOString())
      : { data: [], error: null };

    if (verError) {
      throw new Error('Failed to fetch verification results');
    }

    // Get certificate metadata for verification methods
    const { data: metadata, error: metaError } = certificateIds.length > 0
      ? await supabase
          .from('certificate_metadata')
          .select('certificate_id, verification_details')
          .in('certificate_id', certificateIds)
          .gte('created_at', startDate.toISOString())
      : { data: [], error: null };

    if (metaError) {
      throw new Error('Failed to fetch certificate metadata');
    }

    // Calculate basic stats
    const totalCertificates = totalCerts?.length || 0;
    const verifiedCertificates = totalCerts?.filter(c => c.verification_status === 'verified').length || 0;
    const pendingCertificates = totalCerts?.filter(c => c.verification_status === 'pending').length || 0;
    const rejectedCertificates = totalCerts?.filter(c => c.verification_status === 'rejected').length || 0;
    
    const autoApprovedCertificates = verificationResults?.filter(r => r.auto_approved).length || 0;
    const manualReviewCertificates = verificationResults?.filter(r => !r.auto_approved).length || 0;

    // Calculate average confidence score
    const confidenceScores = verificationResults?.map(r => r.confidence_score).filter(score => score !== null) || [];
    const averageConfidenceScore = confidenceScores.length > 0 
      ? confidenceScores.reduce((sum, score) => sum + score, 0) / confidenceScores.length 
      : 0;

    // Calculate verification methods
    const verificationMethods = {
      qr_verified: 0,
      logo_match: 0,
      template_match: 0,
      manual_review: 0
    };

    metadata?.forEach(meta => {
      const details = meta.verification_details || {};
      if (details.qr_verification?.verified) {
        verificationMethods.qr_verified++;
      } else if (details.logo_match?.score > 0.8) {
        verificationMethods.logo_match++;
      } else if (details.template_match?.score > 0.6) {
        verificationMethods.template_match++;
      } else {
        verificationMethods.manual_review++;
      }
    });

    // Calculate daily stats
    const dailyStats: Array<{
      date: string;
      certificates: number;
      verified: number;
      auto_approved: number;
    }> = [];

    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const dateStr = date.toISOString().split('T')[0];
      
      const dayCerts = totalCerts?.filter(c => 
        c.created_at.startsWith(dateStr)
      ) || [];
      
      const dayVerified = verificationResults?.filter(r => 
        r.created_at.startsWith(dateStr) && r.is_verified
      ) || [];
      
      const dayAutoApproved = verificationResults?.filter(r => 
        r.created_at.startsWith(dateStr) && r.auto_approved
      ) || [];

      dailyStats.push({
        date: dateStr,
        certificates: dayCerts.length,
        verified: dayVerified.length,
        auto_approved: dayAutoApproved.length
      });
    }

    // Get top institutions with org filter
    let instQuery = supabase
      .from('certificates')
      .select('institution, verification_status')
      .gte('created_at', startDate.toISOString());

    if (!orgContext.isSuperAdmin) {
      instQuery = instQuery.in('organization_id', targetOrgIds);
    }

    const { data: institutionData, error: instError } = await instQuery;

    if (instError) {
      throw new Error('Failed to fetch institution data');
    }

    const institutionCounts: Record<string, { count: number; verified: number }> = {};
    institutionData?.forEach(cert => {
      if (!institutionCounts[cert.institution]) {
        institutionCounts[cert.institution] = { count: 0, verified: 0 };
      }
      institutionCounts[cert.institution].count++;
      if (cert.verification_status === 'verified') {
        institutionCounts[cert.institution].verified++;
      }
    });

    const topInstitutions = Object.entries(institutionCounts)
      .map(([institution, stats]) => ({
        institution,
        count: stats.count,
        verified: stats.verified
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Calculate system performance (mock data for now)
    const systemPerformance = {
      averageProcessingTime: Math.floor(Math.random() * 2000) + 1000, // 1-3 seconds
      successRate: 0.95 + Math.random() * 0.04, // 95-99%
      errorRate: Math.random() * 0.02 // 0-2%
    };

    const analyticsData = {
      totalCertificates,
      verifiedCertificates,
      pendingCertificates,
      rejectedCertificates,
      autoApprovedCertificates,
      manualReviewCertificates,
      averageConfidenceScore,
      verificationMethods,
      dailyStats,
      topInstitutions,
      systemPerformance
    };

    return NextResponse.json({ data: analyticsData });

  } catch (error) {
    console.error('Analytics error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch analytics data' },
      { status: 500 }
    );
  }
}



