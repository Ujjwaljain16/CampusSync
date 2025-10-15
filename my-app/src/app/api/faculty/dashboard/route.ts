import { withRole, success } from '@/lib/api';
import { createSupabaseServerClient } from '@/lib/supabaseServer';

export const GET = withRole(['faculty'], async (_req, { user }) => {
  const supabase = await createSupabaseServerClient();

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
      .order('created_at', { ascending: false });

    if (!pendingError && data) {
      pendingDocs = data;
    }
  } catch {
    console.log('⚠️ Documents table not accessible, using empty array');
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
      .eq('actor_id', user.id)
      .order('created_at', { ascending: false })
      .limit(10);

    if (!approvalError && data) {
      recentApprovals = data;
    }
  } catch {
    console.log('⚠️ Audit logs table not accessible, using empty array');
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
  } catch {
    console.log('⚠️ Verification metrics table not accessible, using empty array');
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
