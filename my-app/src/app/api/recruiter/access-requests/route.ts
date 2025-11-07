import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabaseServer';

/**
 * GET /api/recruiter/access-requests
 * 
 * Get all organization access requests for the current recruiter
 */
export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Verify user is a recruiter (check platform-level role with NULL org_id)
    const { data: platformRole } = await supabase
      .from('user_roles')
      .select('role, approval_status')
      .eq('user_id', user.id)
      .eq('role', 'recruiter')
      .is('organization_id', null) // Platform-level recruiter role
      .single();

    if (!platformRole || platformRole.approval_status !== 'approved') {
      return NextResponse.json(
        { error: 'Recruiter role required' },
        { status: 403 }
      );
    }

    const adminClient = await createSupabaseAdminClient();

    // Fetch all access requests (user_roles with specific organization_id)
    const { data: requests, error: requestsError } = await adminClient
      .from('user_roles')
      .select('organization_id, approval_status, created_at, approved_at')
      .eq('user_id', user.id)
      .eq('role', 'recruiter')
      .not('organization_id', 'is', null) // Only org-specific requests
      .order('created_at', { ascending: false });

    if (requestsError) {
      console.error('Failed to fetch access requests:', requestsError);
      return NextResponse.json(
        { error: 'Failed to fetch access requests' },
        { status: 500 }
      );
    }

    const accessRequests = requests?.map((req: {
      organization_id: string;
      approval_status: string;
      created_at: string;
      approved_at: string | null;
    }) => ({
      organization_id: req.organization_id,
      status: req.approval_status,
      requested_at: req.created_at,
      approved_at: req.approved_at
    }));

    return NextResponse.json({
      success: true,
      data: accessRequests || []
    });

  } catch (error: unknown) {
    console.error('[RECRUITER-ACCESS-REQUESTS-GET] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/recruiter/access-requests
 * 
 * Request access to a specific organization
 * Body: { organization_id: string }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Verify user is a recruiter with platform access
    const { data: platformRole } = await supabase
      .from('user_roles')
      .select('role, approval_status, organization_id')
      .eq('user_id', user.id)
      .eq('role', 'recruiter')
      .is('organization_id', null) // Platform-level role
      .single();

    if (!platformRole) {
      return NextResponse.json(
        { error: 'Recruiter role required' },
        { status: 403 }
      );
    }

    if (platformRole.approval_status !== 'approved') {
      return NextResponse.json(
        { error: 'Your platform access is not yet approved' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { organization_id } = body;

    if (!organization_id) {
      return NextResponse.json(
        { error: 'organization_id is required' },
        { status: 400 }
      );
    }

    const adminClient = await createSupabaseAdminClient();

    // Check if organization exists and is active
    const { data: org, error: orgError } = await adminClient
      .from('organizations')
      .select('id, name, is_active')
      .eq('id', organization_id)
      .single();

    if (orgError || !org) {
      return NextResponse.json(
        { error: 'Organization not found' },
        { status: 404 }
      );
    }

    if (!org.is_active) {
      return NextResponse.json(
        { error: 'Organization is not active' },
        { status: 400 }
      );
    }

    // Check if request already exists
    const { data: existingRequest } = await adminClient
      .from('user_roles')
      .select('approval_status')
      .eq('user_id', user.id)
      .eq('role', 'recruiter')
      .eq('organization_id', organization_id)
      .single();

    if (existingRequest) {
      if (existingRequest.approval_status === 'approved') {
        return NextResponse.json(
          { error: 'You already have access to this organization' },
          { status: 400 }
        );
      } else if (existingRequest.approval_status === 'pending') {
        return NextResponse.json(
          { error: 'Your access request is already pending' },
          { status: 400 }
        );
      }
    }

    // Create new access request (new user_roles entry with specific org_id)
    const { data: newRequest, error: insertError } = await adminClient
      .from('user_roles')
      .insert({
        user_id: user.id,
        role: 'recruiter',
        organization_id: organization_id,
        approval_status: 'pending',
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (insertError) {
      console.error('Failed to create access request:', insertError);
      return NextResponse.json(
        { error: 'Failed to create access request' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Access request sent to ${org.name}`,
      data: {
        organization_id: newRequest.organization_id,
        status: newRequest.approval_status,
        requested_at: newRequest.created_at
      }
    });

  } catch (error: unknown) {
    console.error('[RECRUITER-ACCESS-REQUESTS-POST] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
