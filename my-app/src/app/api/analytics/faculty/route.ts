import { withRole, success } from '@/lib/api';
import { createSupabaseServerClient } from '@/lib/supabaseServer';

export const GET = withRole(['faculty', 'admin'], async () => {
  const supabase = await createSupabaseServerClient();

    // Get all certificates with their confidence scores and metadata
    const { data: allCertificates, error: certsError } = await supabase
      .from('certificates')
      .select('id, verification_status, created_at, student_id, confidence_score, auto_approved, verification_method, fields');

    console.log('[Analytics] Total certificates found:', allCertificates?.length);
    console.log('[Analytics] Certificates with confidence_score:', 
      allCertificates?.filter(c => c.confidence_score != null).length);
    console.log('[Analytics] Sample certificate data:', 
      allCertificates?.[0] ? {
        id: allCertificates[0].id,
        confidence_score: allCertificates[0].confidence_score,
        auto_approved: allCertificates[0].auto_approved,
        verification_method: allCertificates[0].verification_method,
        has_fields: !!allCertificates[0].fields
      } : 'No certificates');

    const totalCerts = allCertificates?.length || 0;

    // Get pending, verified, and rejected counts
    const pendingCerts = allCertificates?.filter(c => c.verification_status === 'pending').length || 0;
    const verifiedCerts = allCertificates?.filter(c => c.verification_status === 'verified').length || 0;
    const rejectedCerts = allCertificates?.filter(c => c.verification_status === 'rejected').length || 0;

    // Get document metadata for OCR confidence scores (primary source for new system)
    const { data: documentMetadata } = await supabase
      .from('document_metadata')
      .select('document_id, ai_confidence_score, verification_details, created_at');

    // Also get certificate metadata (primary source for older certificates)
    const { data: certMetadata } = await supabase
      .from('certificate_metadata')
      .select('certificate_id, ai_confidence_score, verification_details, created_at');

    // Build a map of certificate IDs to metadata for easy lookup
    const metadataMap = new Map<string, {
      score: number | null;
      details: Record<string, unknown>;
      created_at: string;
    }>();

    // Add certificate metadata (for older certificates)
    (certMetadata || []).forEach(cm => {
      if (cm.ai_confidence_score != null) {
        metadataMap.set(cm.certificate_id, {
          score: cm.ai_confidence_score,
          details: cm.verification_details,
          created_at: cm.created_at
        });
      }
    });

    // Add document metadata (for newer documents)
    (documentMetadata || []).forEach(dm => {
      if (dm.ai_confidence_score != null) {
        metadataMap.set(dm.document_id, {
          score: dm.ai_confidence_score,
          details: dm.verification_details,
          created_at: dm.created_at
        });
      }
    });

    // Combine certificates with their metadata
    const allMetadata: Array<{
      id: string;
      score: number | null;
      details: Record<string, unknown>;
      created_at: string;
      auto_approved?: boolean;
      verification_method?: string;
    }> = (allCertificates || [])
      .map(cert => {
        const metadata = metadataMap.get(cert.id);
        return {
          id: cert.id,
          score: cert.confidence_score || metadata?.score || null,
          details: metadata?.details || cert.fields || {},
          created_at: cert.created_at,
          auto_approved: cert.auto_approved,
          verification_method: cert.verification_method
        };
      })
      .filter(item => item.score != null); // Only include items with confidence scores

    console.log('[Analytics] Total metadata entries:', allMetadata.length);
    console.log('[Analytics] Sample metadata:', allMetadata[0]);
    console.log('[Analytics] Document metadata found:', documentMetadata?.length || 0);
    console.log('[Analytics] Certificate metadata found:', certMetadata?.length || 0);
    console.log('[Analytics] Metadata map size:', metadataMap.size);

    // Calculate confidence distribution based on OCR extraction confidence
    const confidenceDistribution = {
      high: allMetadata.filter(m => (m.score || 0) >= 0.9).length,
      medium: allMetadata.filter(m => (m.score || 0) >= 0.7 && (m.score || 0) < 0.9).length,
      low: allMetadata.filter(m => (m.score || 0) < 0.7).length,
    };

    // Count auto-approved certificates (only those explicitly marked as auto_approved)
    // Note: Auto-approval is a future feature - currently all certificates are manually approved
    const autoApprovedCerts = allMetadata.filter(m => m.auto_approved === true).length;

    // Get verification method distribution from metadata
    const verificationMethods = {
      qr_verified: 0,
      logo_match: 0,
      template_match: 0,
      ai_confidence: 0,
      manual_review: 0,
    };

    allMetadata.forEach(m => {
      const details = m.details || {};
      const method = m.verification_method;
      
      // Check verification method from certificates table first
      if (method === 'qr_verification') {
        verificationMethods.qr_verified++;
      } else if (method === 'logo_match') {
        verificationMethods.logo_match++;
      } else if (method === 'template_match') {
        verificationMethods.template_match++;
      } else if ((details.qr_verification as Record<string, unknown>)?.verified) {
        verificationMethods.qr_verified++;
      } else if (((details.logo_match as Record<string, unknown>)?.score as number) > 0.8) {
        verificationMethods.logo_match++;
      } else if (((details.template_match as Record<string, unknown>)?.score as number) > 0.6) {
        verificationMethods.template_match++;
      } else if ((m.score || 0) >= 0.7) {
        verificationMethods.ai_confidence++;
      } else {
        verificationMethods.manual_review++;
      }
    });

    // Get recent activity (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const recentActivity = allCertificates?.filter(cert => 
      new Date(cert.created_at) >= sevenDaysAgo
    ) || [];

    // Calculate daily activity
    const dailyActivity = recentActivity.reduce((acc, cert) => {
      const date = new Date(cert.created_at).toISOString().split('T')[0];
      if (!acc[date]) {
        acc[date] = { total: 0, verified: 0, pending: 0, rejected: 0 };
      }
      acc[date].total++;
      const status = cert.verification_status as 'verified' | 'pending' | 'rejected';
      if (status === 'verified' || status === 'pending' || status === 'rejected') {
        acc[date][status]++;
      }
      return acc;
    }, {} as Record<string, { total: number; verified: number; pending: number; rejected: number }>);

    // Calculate auto-approval rate based on high confidence scores
    const autoApprovalRate = totalCerts && totalCerts > 0 
      ? ((autoApprovedCerts || 0) / totalCerts) * 100 
      : 0;

    // Calculate average OCR confidence score from actual extractions
    const avgConfidence = allMetadata.length > 0
      ? allMetadata.reduce((sum: number, m) => sum + (m.score || 0), 0) / allMetadata.length
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

    // Calculate OCR extraction quality metrics
    const ocrMetrics = {
      totalExtractions: allMetadata.length,
      highQuality: allMetadata.filter(m => (m.score || 0) >= 0.9).length,
      mediumQuality: allMetadata.filter(m => (m.score || 0) >= 0.7 && (m.score || 0) < 0.9).length,
      lowQuality: allMetadata.filter(m => (m.score || 0) < 0.7).length,
      averageScore: Math.round(avgConfidence * 1000) / 1000,
      successRate: allMetadata.length > 0 
        ? Math.round((allMetadata.filter(m => (m.score || 0) >= 0.7).length / allMetadata.length) * 100 * 100) / 100
        : 0,
    };

    // Calculate confidence score percentiles for better insights
    const sortedScores = allMetadata.map(m => m.score || 0).sort((a, b) => a - b);
    const confidencePercentiles = {
      p25: sortedScores[Math.floor(sortedScores.length * 0.25)] || 0,
      p50: sortedScores[Math.floor(sortedScores.length * 0.50)] || 0,
      p75: sortedScores[Math.floor(sortedScores.length * 0.75)] || 0,
      p90: sortedScores[Math.floor(sortedScores.length * 0.90)] || 0,
    };

    // Calculate confidence trend over last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const recentMetadata = allMetadata.filter(m => 
      new Date(m.created_at) >= thirtyDaysAgo
    );

    const confidenceTrend = recentMetadata.reduce((acc, m) => {
      const date = new Date(m.created_at).toISOString().split('T')[0];
      if (!acc[date]) {
        acc[date] = { scores: [], avgScore: 0, count: 0 };
      }
      acc[date].scores.push(m.score || 0);
      acc[date].count++;
      return acc;
    }, {} as Record<string, { scores: number[]; avgScore: number; count: number }>);

    // Calculate average for each day
    Object.keys(confidenceTrend).forEach(date => {
      const dayData = confidenceTrend[date];
      dayData.avgScore = dayData.scores.reduce((sum, s) => sum + s, 0) / dayData.scores.length;
    });

    return success({
      overview: {
        totalCertificates: totalCerts || 0,
        autoApproved: autoApprovedCerts || 0,
        pending: pendingCerts || 0,
        verified: verifiedCerts || 0,
        rejected: rejectedCerts || 0,
        autoApprovalRate: Math.round(autoApprovalRate * 100) / 100,
        averageConfidence: Math.round(avgConfidence * 1000) / 1000,
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

