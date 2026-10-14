import { withRole, success, apiError, resolveAdminOrg } from '@/lib/api';
import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { loadAnalyticsCertificates, detectMethod, scoreOf, dayKey, mean } from '@/lib/analytics/certificates';

export const GET = withRole(['faculty', 'admin', 'org_admin', 'super_admin'], async (req, { user }) => {
  const supabase = await createSupabaseServerClient();
  // Caller must hold at least faculty IN the organization (not merely somewhere)
  const requestedOrg = req.headers.get('X-Organization-ID') || new URL(req.url).searchParams.get('organization_id');
  const scope = await resolveAdminOrg(user, requestedOrg, 'faculty');
  const allOrgs = scope.isSuperAdmin && !scope.requested;

  // The only data source: certificates (confidence_score, auto_approved,
  // verification_method and the verification_details jsonb), org-filtered.
  let certs;
  try {
    certs = await loadAnalyticsCertificates(supabase, { orgIds: allOrgs ? null : [scope.organizationId] });
  } catch (err) {
    console.error('Faculty analytics: certificates query failed:', err);
    return apiError.internal('Failed to fetch analytics data');
  }

  const totalCerts = certs.length;
  const pendingCerts = certs.filter(c => c.verification_status === 'pending').length;
  const verifiedCerts = certs.filter(c => c.verification_status === 'verified').length;
  const rejectedCerts = certs.filter(c => c.verification_status === 'rejected').length;

  // Certificates that carry a confidence score
  const scored = certs
    .map(c => ({ cert: c, score: scoreOf(c) }))
    .filter((x): x is { cert: (typeof certs)[number]; score: number } => x.score !== null);
  const scores = scored.map(x => x.score);

  const confidenceDistribution = {
    high: scores.filter(s => s >= 0.9).length,
    medium: scores.filter(s => s >= 0.7 && s < 0.9).length,
    low: scores.filter(s => s < 0.7).length,
  };

  const autoApprovedCerts = certs.filter(c => c.auto_approved === true).length;

  const verificationMethods = {
    qr_verified: 0,
    logo_match: 0,
    template_match: 0,
    ai_confidence: 0,
    manual_review: 0,
  };
  for (const c of certs) {
    const detected = detectMethod(c.verification_method, c.verification_details);
    if (detected) {
      verificationMethods[detected]++;
    } else if ((scoreOf(c) ?? 0) >= 0.7) {
      verificationMethods.ai_confidence++;
    } else {
      verificationMethods.manual_review++;
    }
  }

  // Daily activity, last 7 days
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const dailyActivity: Record<string, { total: number; verified: number; pending: number; rejected: number }> = {};
  for (const cert of certs) {
    if (new Date(cert.created_at) < sevenDaysAgo) continue;
    const date = dayKey(cert.created_at);
    const day = (dailyActivity[date] ??= { total: 0, verified: 0, pending: 0, rejected: 0 });
    day.total++;
    const status = cert.verification_status;
    if (status === 'verified' || status === 'pending' || status === 'rejected') day[status]++;
  }

  // Share of ALL certificates that were auto-approved
  const autoApprovalRate = totalCerts > 0 ? (autoApprovedCerts / totalCerts) * 100 : 0;

  // null when nothing has a confidence score (not a made-up 0)
  const avgConfidence = mean(scores);

  const institutionCounts: Record<string, number> = {};
  for (const cert of certs) {
    if (!cert.institution) continue;
    institutionCounts[cert.institution] = (institutionCounts[cert.institution] || 0) + 1;
  }
  const topInstitutions = Object.entries(institutionCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([institution, count]) => ({ institution, count }));

  // Quality / percentile / trend sections only exist when there are scores to describe
  let ocrMetrics;
  let confidencePercentiles;
  if (scores.length > 0 && avgConfidence !== null) {
    ocrMetrics = {
      totalExtractions: scores.length,
      highQuality: confidenceDistribution.high,
      mediumQuality: confidenceDistribution.medium,
      lowQuality: confidenceDistribution.low,
      averageScore: Math.round(avgConfidence * 1000) / 1000,
      successRate: Math.round(((confidenceDistribution.high + confidenceDistribution.medium) / scores.length) * 100 * 100) / 100,
    };
    const sorted = [...scores].sort((a, b) => a - b);
    const pick = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
    confidencePercentiles = { p25: pick(0.25), p50: pick(0.5), p75: pick(0.75), p90: pick(0.9) };
  }

  // Confidence trend over the last 30 days
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const confidenceTrend: Record<string, { scores: number[]; avgScore: number; count: number }> = {};
  for (const { cert, score } of scored) {
    if (new Date(cert.created_at) < thirtyDaysAgo) continue;
    const date = dayKey(cert.created_at);
    const day = (confidenceTrend[date] ??= { scores: [], avgScore: 0, count: 0 });
    day.scores.push(score);
    day.count++;
  }
  for (const day of Object.values(confidenceTrend)) {
    day.avgScore = mean(day.scores) ?? 0;
  }

  return success({
    overview: {
      totalCertificates: totalCerts,
      autoApproved: autoApprovedCerts,
      pending: pendingCerts,
      verified: verifiedCerts,
      rejected: rejectedCerts,
      autoApprovalRate: Math.round(autoApprovalRate * 100) / 100,
      averageConfidence: avgConfidence === null ? null : Math.round(avgConfidence * 1000) / 1000,
    },
    confidenceDistribution,
    verificationMethods,
    dailyActivity,
    topInstitutions,
    ocrMetrics,
    confidencePercentiles,
    confidenceTrend,
  });
});
