import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { withRole, resolveAdminOrg } from '@/lib/api';
import { loadAnalyticsCertificates, detectMethod, scoreOf, dayKey, mean } from '@/lib/analytics/certificates';

export const GET = withRole(['admin', 'org_admin', 'super_admin'], async (req, { user }) => {
  const supabase = await createSupabaseServerClient();
  const { searchParams } = new URL(req.url);
  const range = searchParams.get('range') || '30d';

  // The caller must be admin-class IN the organization the data is read from.
  // A super_admin who did not pick an organization sees every organization.
  const requestedOrg = req.headers.get('X-Organization-ID') || searchParams.get('organization_id');
  const scope = await resolveAdminOrg(user, requestedOrg, 'admin');
  const allOrgs = scope.isSuperAdmin && !scope.requested;

  try {
    const now = new Date();
    const days = range === '7d' ? 7 : range === '30d' ? 30 : 90;
    const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

    // The only data source: certificates (scored fields + the verification_details jsonb).
    // A failing query throws, which becomes a 500 below, never an empty success.
    const certs = await loadAnalyticsCertificates(supabase, {
      orgIds: allOrgs ? null : [scope.organizationId],
      since: startDate,
    });

    const totalCertificates = certs.length;
    const verifiedCertificates = certs.filter(c => c.verification_status === 'verified').length;
    const pendingCertificates = certs.filter(c => c.verification_status === 'pending').length;
    const rejectedCertificates = certs.filter(c => c.verification_status === 'rejected').length;

    const autoApprovedCertificates = certs.filter(c => c.auto_approved === true).length;
    const manualReviewCertificates = totalCertificates - autoApprovedCertificates;

    // null (not 0) when no certificate in range carries a confidence score
    const averageConfidenceScore = mean(
      certs.map(scoreOf).filter((s): s is number => s !== null)
    );

    const verificationMethods = {
      qr_verified: 0,
      logo_match: 0,
      template_match: 0,
      manual_review: 0
    };
    for (const c of certs) {
      verificationMethods[detectMethod(c.verification_method, c.verification_details) ?? 'manual_review']++;
    }

    const dailyStats: Array<{
      date: string;
      certificates: number;
      verified: number;
      auto_approved: number;
    }> = [];
    const byDay = new Map<string, typeof certs>();
    for (const c of certs) {
      const k = dayKey(c.created_at);
      const list = byDay.get(k);
      if (list) list.push(c); else byDay.set(k, [c]);
    }
    for (let i = days - 1; i >= 0; i--) {
      const dateStr = new Date(now.getTime() - i * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const dayCerts = byDay.get(dateStr) ?? [];
      dailyStats.push({
        date: dateStr,
        certificates: dayCerts.length,
        verified: dayCerts.filter(c => c.verification_status === 'verified').length,
        auto_approved: dayCerts.filter(c => c.auto_approved === true).length
      });
    }

    const institutionCounts: Record<string, { count: number; verified: number }> = {};
    for (const cert of certs) {
      if (!cert.institution) continue;
      const entry = (institutionCounts[cert.institution] ??= { count: 0, verified: 0 });
      entry.count++;
      if (cert.verification_status === 'verified') entry.verified++;
    }
    const topInstitutions = Object.entries(institutionCounts)
      .map(([institution, stats]) => ({ institution, count: stats.count, verified: stats.verified }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // System performance is not measured anywhere yet: report that honestly
    // instead of inventing numbers.
    const systemPerformance = {
      available: false,
      averageProcessingTime: null,
      successRate: null,
      errorRate: null
    };

    return NextResponse.json({
      data: {
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
      }
    });

  } catch (error) {
    console.error('Analytics error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch analytics data' },
      { status: 500 }
    );
  }
});
