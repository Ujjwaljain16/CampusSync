import { withRole, success, getOrganizationContext, getTargetOrganizationIds } from '@/lib/api';
import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { logger } from '@/lib/logger';

export const GET = withRole(['faculty'], async (_req, { user }) => {
  const supabase = await createSupabaseServerClient();

  // Get organization context for multi-tenancy
  const orgContext = await getOrganizationContext(user);
  const targetOrgIds = getTargetOrganizationIds(orgContext);

  // Get pending documents for review (handle missing table gracefully)
  let pendingDocs: unknown[] = [];
  try {
    const { data, error: pendingError } = await supabase
      .from('documents')
      .select(`
        *,
        document_metadata (
          confidence_score,
          verification_status,
          extracted_fields
        )
      `)
      .eq('status', 'pending')
      .in('organization_id', targetOrgIds) // Multi-org filter
      .order('created_at', { ascending: false });

    if (!pendingError && data) {
      pendingDocs = data;
    }
  } catch (error) {
    logger.warn('Documents table not accessible', { error: String(error) });
  }

  // Get recent approvals (handle missing table gracefully)
  let recentApprovals: unknown[] = [];
  try {
    const { data, error: approvalError } = await supabase
      .from('audit_logs')
      .select(`
        *,
        certificates (
          title,
          institution
        )
      `)
      .eq('action', 'approved')
      .eq('user_id', user.id)
      .in('organization_id', targetOrgIds) // Multi-org filter
      .order('created_at', { ascending: false })
      .limit(10);

    if (!approvalError && data) {
      recentApprovals = data;
    }
  } catch (error) {
    logger.warn('Audit logs table not accessible', { error: String(error) });
  }

  // Get analytics (handle missing table gracefully)
  let analytics: unknown[] = [];
  try {
    const { data, error: analyticsError } = await supabase
      .from('verification_metrics')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(30);

    if (!analyticsError && data) {
      analytics = data;
    }
  } catch (error) {
    logger.warn('Verification metrics table not accessible', { error: String(error) });
  }

  return success({
    user: {
      id: user.id,
      email: user.email,
      role: 'faculty'
    },
    pendingDocuments: pendingDocs,
    recentApprovals,
    analytics,
    stats: {
      pendingReview: pendingDocs.length,
      recentApprovals: recentApprovals.length,
      totalProcessed: (analytics as Array<{ total_processed?: number }>).reduce((sum, a) => sum + (a.total_processed || 0), 0),
      averageConfidence: (analytics as Array<{ average_confidence?: number }>).reduce((sum, a) => sum + (a.average_confidence || 0), 0) / (analytics.length || 1)
    }
  });
});


