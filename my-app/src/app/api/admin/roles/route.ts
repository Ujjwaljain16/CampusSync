import { NextRequest } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabaseServer';
import { withRole, success, apiError, parseAndValidateBody, getRequestedOrgId, getOrganizationContext, isRecruiterContext } from '@/lib/api';

type UserRoleRow = {
  user_id: string;
  role?: string;
  organization_id?: string | null;
  is_super_admin?: boolean;
  created_at?: string;
  updated_at?: string;
  assigned_by?: string;
};

type ProfileRow = { id: string; full_name?: string };

type AuthList = { users: Array<{ id: string; email?: string; created_at?: string; user_metadata?: Record<string, unknown> }> };

/**
 * GET /api/admin/roles
 * List all users and their roles (Admin only)
 */
export const GET = withRole(['admin', 'org_admin', 'super_admin'], async (request, { user }) => {
  const adminSupabase = await createSupabaseAdminClient();

  // Determine requested organization (header or query/body)
  const requestedOrgId = await getRequestedOrgId(request);
  const orgContext = await getOrganizationContext(user, requestedOrgId);

  // Build query according to context: super_admin can view across orgs; org_admin/admin only their org
  const query = adminSupabase
    .from('user_roles')
    .select(`
      user_id,
      role,
      organization_id,
      is_super_admin,
      created_at,
      updated_at,
      assigned_by
    `)
    .order('created_at', { ascending: false });

  if (orgContext && !isRecruiterContext(orgContext) && !orgContext.isSuperAdmin) {
    // Restrict to the caller's organization
    query.eq('organization_id', orgContext.organizationId);
  } else if (orgContext && orgContext.isSuperAdmin && requestedOrgId) {
    // If super admin requested a specific org, filter to that org
    query.eq('organization_id', requestedOrgId);
  }

  const { data: users, error } = await query;

  if (error) return apiError.internal(error.message);

  // Get full_name from profiles table (primary source)
  const userIds = (users as UserRoleRow[] | undefined)?.map(u => u.user_id) || [];
  const { data: profiles } = await adminSupabase
    .from('profiles')
    .select('id, full_name')
    .in('id', userIds);
  
  const profileMap = new Map(((profiles || []) as ProfileRow[]).map(p => [p.id, p.full_name]));

  // Get user details from auth
  const authResult = await adminSupabase.auth.admin.listUsers();
  const authUsers = authResult.data as AuthList | undefined;
  const authError = authResult.error;

  if (authError) {
    console.error('Error fetching auth users:', authError);
    // Return users without email details if auth fetch fails
    return success(users);
  }

  // Merge user roles with auth user data and profile data
  const usersWithAuth = (users as UserRoleRow[] | undefined)?.map(userRole => {
    const authUser = (authUsers?.users || []).find(au => au.id === userRole.user_id);
    const profileFullName = profileMap.get(userRole.user_id);
    const metadata = authUser?.user_metadata as { full_name?: string; name?: string } | undefined;
    const full_name = profileFullName || metadata?.full_name || metadata?.name;
    
    return {
      ...userRole,
      auth_users: authUser ? {
        email: authUser.email,
        created_at: authUser.created_at,
        full_name: full_name || null
      } : null
    };
  }) || [];

  return success(usersWithAuth);
});

/**
 * POST /api/admin/roles
 * Assign or update user role (Admin only)
 */
export const POST = withRole(['admin', 'org_admin', 'super_admin'], async (request, { user, role: callerRole }) => {
  const { data: body, error: validationError } = await parseAndValidateBody<{
    user_id: string;
    role: string;
    organization_id?: string | null;
  }>(request, ['user_id', 'role']);
  
  if (validationError) return validationError;

  const allowedRoles = ['student', 'faculty', 'admin', 'recruiter', 'org_admin'];
  // Only super_admin can assign super_admin
  if (body.role === 'super_admin' && callerRole !== 'super_admin') {
    return apiError.forbidden('Only super_admin can assign super_admin role');
  }

  if (!allowedRoles.includes(body.role) && body.role !== 'super_admin') {
    return apiError.validation('Invalid role');
  }

  // Determine organization scope
  const adminSupabase = await createSupabaseAdminClient();
  const requestedOrgId = body.organization_id ?? (await getRequestedOrgId(request));
  const orgContext = await getOrganizationContext(user, requestedOrgId);

  // If caller is org_admin or admin they can only assign within their organization
  if (callerRole === 'org_admin' || callerRole === 'admin') {
    if (isRecruiterContext(orgContext)) {
      return apiError.forbidden('Recruiters cannot assign roles');
    }
    if (!requestedOrgId || requestedOrgId !== orgContext.organizationId) {
      return apiError.forbidden('Insufficient permissions to assign roles outside your organization');
    }
  }

  // For org_admin role, organization_id is required
  if (body.role === 'org_admin' && !requestedOrgId) {
    return apiError.validation('organization_id is required to assign org_admin role');
  }

  // Prevent admins from demoting themselves if they only have a single admin role
  if (body.user_id === user.id && body.role !== 'admin' && callerRole === 'admin') {
    return apiError.forbidden('Admins cannot demote themselves');
  }

  // Check if user exists in that organization
  const { data: existingRole, error: userError } = await adminSupabase
    .from('user_roles')
    .select('user_id')
    .eq('user_id', body.user_id)
    .eq('organization_id', requestedOrgId ?? null)
    .single();

  if (userError && userError.code !== 'PGRST116') {
    return apiError.internal(userError.message);
  }

  const now = new Date().toISOString();

  if (existingRole) {
    const { error } = await adminSupabase
      .from('user_roles')
      .update({ role: body.role, assigned_by: user.id, updated_at: now })
      .eq('user_id', body.user_id)
      .eq('organization_id', requestedOrgId ?? null);

    if (error) return apiError.internal(error.message);
  } else {
    const { error } = await adminSupabase
      .from('user_roles')
      .insert({
        user_id: body.user_id,
        role: body.role,
        organization_id: requestedOrgId ?? null,
        assigned_by: user.id,
        created_at: now,
        updated_at: now
      });

    if (error) return apiError.internal(error.message);
  }

  return success({ user_id: body.user_id, role: body.role, organization_id: requestedOrgId ?? null }, 'Role updated successfully');
});

// DELETE /api/admin/roles - Remove user role (revert to default student)
export const DELETE = withRole(['admin', 'org_admin', 'super_admin'], async (req: NextRequest, { user, role: callerRole }) => {

  const { searchParams } = new URL(req.url);
  const userId = searchParams.get('user_id');
  const organizationId = searchParams.get('organization_id');
  
  if (!userId) {
    throw apiError.badRequest('Missing user_id parameter');
  }

  // Prevent removing your own role
  if (userId === user.id) {
    throw apiError.forbidden('Admins cannot remove their own role');
  }

  const adminSupabase = await createSupabaseAdminClient();

  // Determine organization scope: if caller is org_admin/admin they can only remove roles in their org
  const orgContext = await getOrganizationContext(user, organizationId || undefined);
  if ((callerRole === 'org_admin' || callerRole === 'admin') && orgContext && !isRecruiterContext(orgContext) && !orgContext.isSuperAdmin) {
    if (!organizationId || organizationId !== orgContext.organizationId) {
      return apiError.forbidden('Insufficient permissions to remove roles outside your organization');
    }
  }

  // If deleting an admin-like role, ensure org will still have at least one admin/org_admin/super_admin
  const { data: targetRoleRow, error: targetErr } = await adminSupabase
    .from('user_roles')
    .select('role, organization_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (targetErr) {
    return apiError.internal('Failed to lookup target user role');
  }

  const targetRole = targetRoleRow?.role || null;
  const targetOrg = organizationId ?? targetRoleRow?.organization_id ?? null;

  if (['admin', 'org_admin'].includes(targetRole || '')) {
    // Count admin+org_admin+super_admin in that organization (or system-wide if null)
    const roleCountQuery = adminSupabase
      .from('user_roles')
      .select('user_id', { count: 'exact', head: true })
      .in('role', ['org_admin', 'admin', 'super_admin']);

    if (targetOrg) {
      roleCountQuery.eq('organization_id', targetOrg);
    }

    const { count: adminCount, error: countError } = await roleCountQuery;

    if (countError) return apiError.internal('Failed to check admin count');

    if (adminCount && adminCount <= 1) {
      return apiError.forbidden('Cannot remove role: At least one admin must remain for the organization');
    }
  }

  // Delete the specific role row (optionally scoped to organization)
  const deleteQuery = adminSupabase.from('user_roles').delete().eq('user_id', userId);
  if (organizationId !== null) deleteQuery.eq('organization_id', organizationId as string);

  const { error } = await deleteQuery;

  if (error) return apiError.internal(error.message);

  return success({ user_id: userId, message: 'Role removed, user reverted to default student role' });
});

