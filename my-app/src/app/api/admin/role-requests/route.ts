import { NextRequest } from 'next/server';
import { withRole, success, apiError, getOrganizationContext, getUserAccessibleOrganizations, isRecruiterContext } from '@/lib/api';
import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabaseServer';

export const GET = withRole(['admin', 'org_admin', 'super_admin'], async (req: NextRequest, { user }) => {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status') || 'pending';
  const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 100);
  const offset = Math.max(parseInt(searchParams.get('offset') || '0', 10), 0);

  const supabase = await createSupabaseServerClient();
  const adminSupabase = await createSupabaseAdminClient();
  
  // Get accessible organizations (super admins see all, org admins see their org)
  const orgContext = await getOrganizationContext(user);
  let accessibleOrgs: string[];
  
  if (orgContext.isSuperAdmin) {
    accessibleOrgs = await getUserAccessibleOrganizations(user);
  } else if (isRecruiterContext(orgContext)) {
    accessibleOrgs = orgContext.selectedOrganization 
      ? [orgContext.selectedOrganization]
      : orgContext.accessibleOrganizations;
  } else {
    accessibleOrgs = [orgContext.organizationId];
  }
  
  const query = supabase
    .from('role_requests')
    .select('id, user_id, requested_role, metadata, status, reviewed_by, reviewed_at, created_at, organization_id')
    .in('organization_id', accessibleOrgs) // Multi-org filter
    .eq('status', status)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  const { data, error } = await query;
  if (error) {
    console.error('Error fetching role requests:', error);
    throw apiError.internal(error.message);
  }

  // Get user details from auth system and profiles table
  const userIds = Array.from(new Set((data || []).map(r => r.user_id)));
  const authUsersMap = new Map<string, { email?: string; full_name?: string }>();
  
  if (userIds.length > 0) {
    // Fetch full_name from profiles table (primary source)
    const { data: profs } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', userIds);
    
    const profileMap = new Map((profs || []).map(p => [p.id, p.full_name]));

    // Fetch auth user details using admin client for email
    const { data: authUsers, error: authError } = await adminSupabase.auth.admin.listUsers();
    
    if (!authError && authUsers?.users) {
      // Create a map of user_id to auth user data with profile full_name
      authUsers.users.forEach((authUser: { id: string; email?: string; user_metadata?: Record<string, unknown> }) => {
        if (userIds.includes(authUser.id)) {
          authUsersMap.set(authUser.id, {
            email: authUser.email,
            full_name: profileMap.get(authUser.id) || (authUser.user_metadata?.full_name as string) || (authUser.user_metadata?.name as string)
          });
        }
      });
    } else {
      // If auth fetch fails, use profile data only
      profileMap.forEach((full_name, id) => {
        authUsersMap.set(id, { full_name });
      });
    }
  }

  // Enrich role requests with user information
  const enriched = (data || []).map(r => {
    const authUser = authUsersMap.get(r.user_id);
    
    return {
      ...r,
      requester_name: authUser?.full_name || authUser?.email?.split('@')[0] || 'Unknown User',
      requester_email: authUser?.email || 'Unknown',
    };
  });

  return success({ data: enriched, pagination: { limit, offset } });
});



