import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient, createSupabaseServerClient } from '@/lib/supabaseServer';

/**
 * GET /api/admin/faculty-approvals
 * 
 * Get faculty and recruiter approval requests for the admin's organization
 * Query params:
 *  - status: 'pending' | 'approved' | 'denied' | 'all' (default: 'pending')
 *  - role: 'faculty' | 'recruiter' | 'all' (default: 'all')
 */
export async function GET(request: NextRequest) {
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

    // Check if user is admin/org_admin
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role, organization_id')
      .eq('user_id', user.id)
      .single();

    if (!roleData || !['admin', 'org_admin', 'super_admin'].includes(roleData.role)) {
      return NextResponse.json(
        { error: 'Admin access required' },
        { status: 403 }
      );
    }

    // Get query params
    const { searchParams } = new URL(request.url);
    const statusFilter = searchParams.get('status') || 'pending';
    const roleFilter = searchParams.get('role') || 'all';

    const adminClient = await createSupabaseAdminClient();
    const isSuperAdmin = roleData.role === 'super_admin';

    // Build query for user_roles
    let query = adminClient
      .from('user_roles')
      .select('user_id, organization_id, role, approval_status, created_at, approved_at, approved_by, approval_notes');

    // Super admins see ALL recruiters (NULL org_id) + faculty from all orgs
    // Regular admins see only their organization's faculty
    if (isSuperAdmin) {
      // Super admin: Show recruiters (NULL org_id) OR any role with specific role filter
      if (roleFilter === 'recruiter') {
        query = query.eq('role', 'recruiter').is('organization_id', null);
      } else if (roleFilter === 'faculty') {
        query = query.eq('role', 'faculty');
      } else {
        // Show both: recruiters (NULL org_id) + all faculty
        query = query.in('role', ['faculty', 'recruiter']);
      }
    } else {
      // Regular admin: Only show their organization's faculty/recruiters
      query = query
        .eq('organization_id', roleData.organization_id)
        .in('role', ['faculty', 'recruiter']);
    }

    // Apply status filter
    if (statusFilter !== 'all') {
      query = query.eq('approval_status', statusFilter);
    }

    // Apply role filter
    if (roleFilter !== 'all') {
      query = query.eq('role', roleFilter);
    }

    query = query.order('created_at', { ascending: false });

    const { data: requests, error: requestsError } = await query;

    if (requestsError) {
      console.error('Failed to fetch approval requests:', requestsError);
      return NextResponse.json(
        { error: 'Failed to fetch approval requests' },
        { status: 500 }
      );
    }

    if (!requests || requests.length === 0) {
      return NextResponse.json({
        success: true,
        data: []
      });
    }

    // Get unique user IDs and organization IDs
    const userIds = [...new Set(requests.map((r: { user_id: string }) => r.user_id))];
    const orgIds = [...new Set(requests.map((r: { organization_id: string }) => r.organization_id))];

    // Fetch user profiles separately (including company_name for recruiters)
    const { data: profiles } = await adminClient
      .from('profiles')
      .select('id, email, full_name, company_name')
      .in('id', userIds);

    // Fetch organizations separately
    const { data: organizations } = await adminClient
      .from('organizations')
      .select('id, name')
      .in('id', orgIds);

    // Create lookup maps
    type Profile = { id: string; email: string; full_name: string; company_name?: string };
    type Organization = { id: string; name: string };
    const profileMap = new Map<string, Profile>((profiles || []).map((p: Profile) => [p.id, p]));
    const orgMap = new Map<string, Organization>((organizations || []).map((o: Organization) => [o.id, o]));

    // Transform data to match frontend expectations
    const transformedData = requests.map((req: {
      user_id: string;
      role: string;
      organization_id: string;
      approval_status: string;
      created_at: string;
      approved_at: string | null;
      approved_by: string | null;
      approval_notes: string | null;
    }) => {
      const profile = profileMap.get(req.user_id);
      const org = orgMap.get(req.organization_id);
      
      // For recruiters, use company_name instead of organization name
      const displayOrganization = req.role === 'recruiter' 
        ? (profile?.company_name || 'Platform Access') 
        : (org?.name || 'Unknown Organization');
      
      return {
        user_id: req.user_id,
        role: req.role,
        organization_id: req.organization_id,
        approval_status: req.approval_status,
        created_at: req.created_at,
        approved_at: req.approved_at,
        approved_by: req.approved_by,
        approval_notes: req.approval_notes,
        user_email: profile?.email || 'Unknown',
        user_name: profile?.full_name || profile?.email?.split('@')[0] || 'Unknown User',
        organization_name: displayOrganization,
        company_name: profile?.company_name || null
      };
    });

    return NextResponse.json({
      success: true,
      data: transformedData
    });

  } catch (error: unknown) {
    console.error('[FACULTY-APPROVALS] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/faculty-approvals
 * 
 * Approve or deny a faculty/recruiter access request
 * 
 * Body: {
 *   user_id: string,
 *   organization_id: string,
 *   approval_status: 'approved' | 'denied',
 *   notes?: string
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    
    // Get current user (admin)
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Check if user is admin/org_admin
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role, organization_id')
      .eq('user_id', user.id)
      .single();

    if (!roleData || !['admin', 'org_admin', 'super_admin'].includes(roleData.role)) {
      return NextResponse.json(
        { error: 'Admin access required' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { user_id, approval_status, notes } = body;

    // Validation
    if (!user_id || !approval_status) {
      return NextResponse.json(
        { error: 'Missing required fields: user_id, approval_status' },
        { status: 400 }
      );
    }

    if (!['approved', 'denied'].includes(approval_status)) {
      return NextResponse.json(
        { error: 'Invalid status. Must be "approved" or "denied"' },
        { status: 400 }
      );
    }

    const adminClient = await createSupabaseAdminClient();
    const isSuperAdmin = roleData.role === 'super_admin';

    // SECURITY: Get the user's role to check permissions
    const { data: targetUserRole, error: targetRoleError } = await adminClient
      .from('user_roles')
      .select('role, organization_id, approval_status')
      .eq('user_id', user_id)
      .eq('approval_status', 'pending')
      .single();

    if (targetRoleError || !targetUserRole) {
      return NextResponse.json(
        { error: 'User role not found or already processed' },
        { status: 404 }
      );
    }

    // SECURITY CHECK: Only super admins can approve recruiters (NULL org_id)
    if (targetUserRole.role === 'recruiter' && targetUserRole.organization_id === null) {
      if (!isSuperAdmin) {
        return NextResponse.json(
          { error: 'Only super admins can approve platform-level recruiter access' },
          { status: 403 }
        );
      }
    }

    // SECURITY CHECK: Org admins can only approve their own org's faculty
    if (!isSuperAdmin) {
      if (targetUserRole.organization_id !== roleData.organization_id) {
        return NextResponse.json(
          { error: 'You can only approve users for your organization' },
          { status: 403 }
        );
      }
    }

    // Build update query based on organization_id (NULL for recruiters, specific for faculty)
    let updateQuery = adminClient
      .from('user_roles')
      .update({
        approval_status,
        approved_by: user.id,
        approved_at: new Date().toISOString(),
        approval_notes: notes || null,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', user_id)
      .in('role', ['faculty', 'recruiter'])
      .eq('approval_status', 'pending');

    // Match organization_id exactly (NULL for recruiters, specific ID for faculty)
    if (targetUserRole.organization_id === null) {
      updateQuery = updateQuery.is('organization_id', null);
    } else {
      updateQuery = updateQuery.eq('organization_id', targetUserRole.organization_id);
    }

    const { data: updatedRole, error: updateError } = await updateQuery
      .select()
      .single();

    if (updateError) {
      console.error('Failed to update approval:', updateError);
      return NextResponse.json(
        { error: 'Failed to update approval status' },
        { status: 500 }
      );
    }

    if (!updatedRole) {
      return NextResponse.json(
        { error: 'Approval request not found or already processed' },
        { status: 404 }
      );
    }

    // Get user details for response
    const { data: userProfile } = await adminClient
      .from('profiles')
      .select('email, full_name')
      .eq('id', user_id)
      .single();

    return NextResponse.json({
      success: true,
      message: `${updatedRole.role} request ${approval_status}`,
      user: {
        user_id,
        email: userProfile?.email,
        full_name: userProfile?.full_name,
        role: updatedRole.role,
        status: approval_status
      }
    });

  } catch (error: unknown) {
    console.error('[FACULTY-APPROVALS] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
