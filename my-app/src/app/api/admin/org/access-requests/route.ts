import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabaseServer';

/**
 * GET /api/admin/org/access-requests
 * 
 * Get pending recruiter access requests for org admin's organization.
 */
export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user's org admin role
    const { data: userRole, error: roleError } = await supabase
      .from('user_roles')
      .select('role, organization_id')
      .eq('user_id', user.id)
      .in('role', ['org_admin', 'admin'])
      .not('organization_id', 'is', null)
      .maybeSingle();

    if (roleError || !userRole) {
      return NextResponse.json(
        { error: 'Organization admin access required' },
        { status: 403 }
      );
    }

    // Get pending access requests for this organization
    const { data: requests, error } = await supabase
      .from('recruiter_org_access')
      .select('id, status, requested_at, notes, recruiter_user_id')
      .eq('organization_id', userRole.organization_id)
      .eq('status', 'pending')
      .order('requested_at', { ascending: false });

    if (error) {
      console.error('[GET_ACCESS_REQUESTS] Error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch access requests' },
        { status: 500 }
      );
    }

    // Fetch recruiter profiles separately
    const recruiterIds = requests?.map(req => req.recruiter_user_id) || [];
    const { data: profiles } = await supabase
      .from('profiles')
      .select('user_id, full_name, company, linkedin_url, email')
      .in('user_id', recruiterIds);

    const profileMap = new Map(profiles?.map(p => [p.user_id, p]));

    // Transform data for easier consumption
    const transformedRequests = requests?.map(req => {
      const profile = profileMap.get(req.recruiter_user_id);
      return {
        id: req.id,
        status: req.status,
        requestedAt: req.requested_at,
        notes: req.notes,
        recruiter: {
          id: req.recruiter_user_id,
          email: profile?.email,
          fullName: profile?.full_name,
          company: profile?.company,
          linkedinUrl: profile?.linkedin_url
        }
      };
    }) || [];

    return NextResponse.json({ 
      requests: transformedRequests,
      count: transformedRequests.length 
    });

  } catch (error: unknown) {
    console.error('[GET_ACCESS_REQUESTS] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/org/access-requests
 * 
 * Review (approve/deny) a recruiter access request.
 * Body: { requestId, action: 'approve' | 'deny', reviewNotes? }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user's org admin role
    const { data: userRole, error: roleError } = await supabase
      .from('user_roles')
      .select('role, organization_id')
      .eq('user_id', user.id)
      .in('role', ['org_admin', 'admin'])
      .not('organization_id', 'is', null)
      .maybeSingle();

    if (roleError || !userRole) {
      return NextResponse.json(
        { error: 'Organization admin access required' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { requestId, action, reviewNotes } = body;

    if (!requestId || !action) {
      return NextResponse.json(
        { error: 'requestId and action are required' },
        { status: 400 }
      );
    }

    if (!['approve', 'deny'].includes(action)) {
      return NextResponse.json(
        { error: 'action must be "approve" or "deny"' },
        { status: 400 }
      );
    }

    // Get the access request
    const { data: accessRequest, error: fetchError } = await supabase
      .from('recruiter_org_access')
      .select('id, recruiter_user_id, organization_id, status')
      .eq('id', requestId)
      .eq('organization_id', userRole.organization_id)
      .single();

    if (fetchError || !accessRequest) {
      return NextResponse.json(
        { error: 'Access request not found' },
        { status: 404 }
      );
    }

    if (accessRequest.status !== 'pending') {
      return NextResponse.json(
        { error: 'This request has already been reviewed' },
        { status: 409 }
      );
    }

    // Update request status
    const newStatus = action === 'approve' ? 'approved' : 'denied';
    const { error: updateError } = await supabase
      .from('recruiter_org_access')
      .update({
        status: newStatus,
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
        review_notes: reviewNotes || null
      })
      .eq('id', requestId);

    if (updateError) {
      console.error('[REVIEW_REQUEST] Update failed:', updateError);
      return NextResponse.json(
        { error: 'Failed to update request' },
        { status: 500 }
      );
    }

    // Log audit event
    await supabase.from('audit_logs').insert({
      user_id: user.id,
      action: `recruiter_access_${newStatus}`,
      resource_type: 'organization',
      resource_id: userRole.organization_id,
      metadata: {
        request_id: requestId,
        recruiter_user_id: accessRequest.recruiter_user_id,
        review_notes: reviewNotes
      }
    });

    return NextResponse.json({
      success: true,
      status: newStatus,
      message: `Access request ${newStatus}`
    });

  } catch (error: unknown) {
    console.error('[REVIEW_REQUEST] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
