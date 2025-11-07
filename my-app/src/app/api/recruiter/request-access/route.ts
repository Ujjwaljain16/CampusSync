import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabaseServer';

/**
 * POST /api/recruiter/request-access
 * 
 * Recruiter requests access to an organization.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify user is a recruiter
    const { data: userRole, error: roleError } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .is('organization_id', null)
      .single();

    if (roleError || userRole?.role !== 'recruiter') {
      return NextResponse.json(
        { error: 'Only recruiters can request organization access' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { organization_id, notes } = body;

    if (!organization_id) {
      return NextResponse.json(
        { error: 'organization_id is required' },
        { status: 400 }
      );
    }

    // Verify organization exists
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .select('id, name')
      .eq('id', organization_id)
      .eq('is_active', true)
      .single();

    if (orgError || !org) {
      return NextResponse.json(
        { error: 'Organization not found' },
        { status: 404 }
      );
    }

    // Check if request already exists
    const { data: existingRequest } = await supabase
      .from('recruiter_org_access')
      .select('id, status')
      .eq('recruiter_user_id', user.id)
      .eq('organization_id', organization_id)
      .maybeSingle();

    if (existingRequest) {
      if (existingRequest.status === 'pending') {
        return NextResponse.json(
          { error: 'You already have a pending request for this organization' },
          { status: 409 }
        );
      }
      if (existingRequest.status === 'approved') {
        return NextResponse.json(
          { error: 'You already have access to this organization' },
          { status: 409 }
        );
      }
      // If denied or revoked, allow creating a new request
      // Delete old request first
      await supabase
        .from('recruiter_org_access')
        .delete()
        .eq('id', existingRequest.id);
    }

    // Create access request
    const { data: newRequest, error: insertError } = await supabase
      .from('recruiter_org_access')
      .insert({
        recruiter_user_id: user.id,
        organization_id,
        status: 'pending',
        notes: notes || null
      })
      .select()
      .single();

    if (insertError) {
      console.error('[REQUEST_ACCESS] Failed to create request:', insertError);
      return NextResponse.json(
        { error: 'Failed to create access request' },
        { status: 500 }
      );
    }

    // Log audit event
    await supabase.from('audit_logs').insert({
      user_id: user.id,
      action: 'recruiter_access_requested',
      resource_type: 'organization',
      resource_id: organization_id,
      metadata: { request_id: newRequest.id, organization_name: org.name }
    });

    return NextResponse.json({
      success: true,
      requestId: newRequest.id,
      status: 'pending',
      message: `Access request sent to ${org.name}. You'll be notified when it's reviewed.`
    }, { status: 201 });

  } catch (error: unknown) {
    console.error('[REQUEST_ACCESS] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/recruiter/request-access
 * 
 * Get all access requests for the logged-in recruiter.
 */
export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get all access requests for this recruiter
    const { data: requests, error } = await supabase
      .from('recruiter_org_access')
      .select(`
        id,
        status,
        requested_at,
        reviewed_at,
        notes,
        review_notes:reviewed_by,
        organization:organization_id (
          id,
          name,
          slug,
          type
        )
      `)
      .eq('recruiter_user_id', user.id)
      .order('requested_at', { ascending: false });

    if (error) {
      console.error('[GET_REQUESTS] Error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch requests' },
        { status: 500 }
      );
    }

    return NextResponse.json({ requests });

  } catch (error: unknown) {
    console.error('[GET_REQUESTS] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
