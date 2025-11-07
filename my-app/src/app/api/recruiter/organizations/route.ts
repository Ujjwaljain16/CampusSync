import { NextResponse } from 'next/server';
import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabaseServer';

/**
 * GET /api/recruiter/organizations
 * 
 * Get all active organizations for recruiters to browse and request access
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

    // Verify user is a recruiter with platform-level approval
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role, approval_status, organization_id')
      .eq('user_id', user.id)
      .eq('role', 'recruiter')
      .is('organization_id', null) // Check platform-level approval
      .single();

    if (!roleData) {
      return NextResponse.json(
        { error: 'Recruiter role required' },
        { status: 403 }
      );
    }

    if (roleData.approval_status !== 'approved') {
      return NextResponse.json(
        { error: 'Your recruiter account is pending approval' },
        { status: 403 }
      );
    }

    const adminClient = await createSupabaseAdminClient();

    // Fetch all active organizations with stats
    const { data: organizations, error: orgsError } = await adminClient
      .from('organizations')
      .select(`
        id,
        name,
        slug,
        type,
        email,
        phone,
        address,
        branding,
        is_active,
        is_verified,
        created_at
      `)
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (orgsError) {
      console.error('Failed to fetch organizations:', orgsError);
      return NextResponse.json(
        { error: 'Failed to fetch organizations' },
        { status: 500 }
      );
    }

    // Get student and faculty counts for each organization
    const orgIds = organizations?.map((org: { id: string }) => org.id) || [];
    
    // Get student counts (only approved students from user_roles)
    const { data: studentCounts } = await adminClient
      .from('user_roles')
      .select('organization_id')
      .eq('role', 'student')
      .eq('approval_status', 'approved')
      .in('organization_id', orgIds);

    // Get faculty counts (only approved faculty from user_roles)
    const { data: facultyCounts } = await adminClient
      .from('user_roles')
      .select('organization_id')
      .eq('role', 'faculty')
      .eq('approval_status', 'approved')
      .in('organization_id', orgIds);

    // Create count maps
    const studentCountMap = new Map<string, number>();
    const facultyCountMap = new Map<string, number>();

    studentCounts?.forEach((s: { organization_id: string }) => {
      studentCountMap.set(s.organization_id, (studentCountMap.get(s.organization_id) || 0) + 1);
    });

    facultyCounts?.forEach((f: { organization_id: string }) => {
      facultyCountMap.set(f.organization_id, (facultyCountMap.get(f.organization_id) || 0) + 1);
    });

    // Add counts to organizations
    const organizationsWithCounts = organizations?.map((org: {
      id: string;
      name: string;
      slug: string;
      type: string;
      email: string;
      phone: string | null;
      address: unknown;
      branding: unknown;
      is_active: boolean;
      is_verified: boolean;
      created_at: string;
    }) => ({
      ...org,
      student_count: studentCountMap.get(org.id) || 0,
      faculty_count: facultyCountMap.get(org.id) || 0,
      // Extract logo_url from branding JSONB
      logo_url: (org.branding as { logo_url?: string })?.logo_url || null,
      // Extract location from address JSONB
      location: org.address ? JSON.stringify(org.address) : null,
    }));

    return NextResponse.json({
      success: true,
      data: organizationsWithCounts || []
    });

  } catch (error: unknown) {
    console.error('[RECRUITER-ORGANIZATIONS] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
