import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClientWithAuth } from '@/lib/supabaseServer';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClientWithAuth(request);
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user role
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    if (!roleData || roleData.role !== 'faculty') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Get pending documents for review (handle missing table gracefully)
    let pendingDocs = [];
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

      if (pendingError) {
        console.log('⚠️ Documents table not found or empty, using empty array');
        pendingDocs = [];
      } else {
        pendingDocs = data || [];
      }
    } catch (error) {
      console.log('⚠️ Documents table not accessible, using empty array');
      pendingDocs = [];
    }

    // Get recent approvals (handle missing table gracefully)
    let recentApprovals = [];
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

      if (approvalError) {
        console.log('⚠️ Audit logs table not found or empty, using empty array');
        recentApprovals = [];
      } else {
        recentApprovals = data || [];
      }
    } catch (error) {
      console.log('⚠️ Audit logs table not accessible, using empty array');
      recentApprovals = [];
    }

    // Get analytics (handle missing table gracefully)
    let analytics = [];
    try {
      const { data, error: analyticsError } = await supabase
        .from('verification_metrics')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(30);

      if (analyticsError) {
        console.log('⚠️ Verification metrics table not found or empty, using empty array');
        analytics = [];
      } else {
        analytics = data || [];
      }
    } catch (error) {
      console.log('⚠️ Verification metrics table not accessible, using empty array');
      analytics = [];
    }

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        role: roleData.role
      },
      pendingDocuments: pendingDocs || [],
      recentApprovals: recentApprovals || [],
      analytics: analytics || [],
      stats: {
        pendingReview: pendingDocs?.length || 0,
        recentApprovals: recentApprovals?.length || 0,
        totalProcessed: analytics?.reduce((sum, a) => sum + (a.total_processed || 0), 0) || 0,
        averageConfidence: analytics?.reduce((sum, a) => sum + (a.average_confidence || 0), 0) / (analytics?.length || 1) || 0
      }
    });

  } catch (error) {
    console.error('Faculty dashboard error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
