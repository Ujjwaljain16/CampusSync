import { NextRequest } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabaseServer';
import { withRole, success, apiError, parseAndValidateBody } from '@/lib/api';

/**
 * GET /api/admin/roles
 * List all users and their roles (Admin only)
 */
export const GET = withRole(['admin'], async () => {
  const adminSupabase = createSupabaseAdminClient();
  
  // Get all users with their roles using admin client to bypass RLS
  const { data: users, error } = await adminSupabase
    .from('user_roles')
    .select(`
      user_id,
      role,
      is_super_admin,
      created_at,
      updated_at,
      assigned_by
    `)
    .order('created_at', { ascending: false });

  if (error) return apiError.internal(error.message);

  // Get full_name from profiles table (primary source)
  const userIds = users?.map(u => u.user_id) || [];
  const { data: profiles } = await adminSupabase
    .from('profiles')
    .select('id, full_name')
    .in('id', userIds);
  
  const profileMap = new Map((profiles || []).map(p => [p.id, p.full_name]));

  // Get user details from auth
  const { data: authUsers, error: authError } = await adminSupabase.auth.admin.listUsers();

  if (authError) {
    console.error('Error fetching auth users:', authError);
    // Return users without email details if auth fetch fails
    return success(users);
  }

  // Merge user roles with auth user data and profile data
  const usersWithAuth = users?.map(userRole => {
    const authUser = authUsers.users.find(au => au.id === userRole.user_id);
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
export const POST = withRole(['admin'], async (request, { user }) => {
  const { data: body, error: validationError } = await parseAndValidateBody<{
    user_id: string;
    role: string;
  }>(request, ['user_id', 'role']);
  
  if (validationError) return validationError;

  if (!['student', 'faculty', 'admin', 'recruiter'].includes(body.role)) {
    return apiError.validation('Invalid role. Must be student, faculty, admin, or recruiter');
  }

  // 🛡️ SAFETY CHECK: Prevent admins from demoting themselves
  if (body.user_id === user.id && body.role !== 'admin') {
    return apiError.forbidden('Security violation: Admins cannot demote themselves. This prevents system lockout.');
  }

  const adminSupabase = createSupabaseAdminClient();
  
  // Check if user exists using admin client
  const { data: userExists, error: userError } = await adminSupabase
    .from('user_roles')
    .select('user_id')
    .eq('user_id', body.user_id)
    .single();

  if (userError && userError.code !== 'PGRST116') { // PGRST116 = no rows found
    return apiError.internal(userError.message);
  }

  const now = new Date().toISOString();
  
  if (userExists) {
    // Update existing role
    const { error } = await adminSupabase
      .from('user_roles')
      .update({
        role: body.role,
        assigned_by: user.id,
        updated_at: now
      })
      .eq('user_id', body.user_id);
    
    if (error) return apiError.internal(error.message);
  } else {
    // Insert new role
    const { error } = await adminSupabase
      .from('user_roles')
      .insert({
        user_id: body.user_id,
        role: body.role,
        assigned_by: user.id,
        created_at: now,
        updated_at: now
      });
    
    if (error) return apiError.internal(error.message);
  }

  return success({ 
    user_id: body.user_id, 
    role: body.role
  }, 'Role updated successfully');
});

// DELETE /api/admin/roles - Remove user role (revert to default student)
export const DELETE = withRole(['admin'], async (req: NextRequest, { user }) => {

  const { searchParams } = new URL(req.url);
  const userId = searchParams.get('user_id');
  
  if (!userId) {
    throw apiError.badRequest('Missing user_id parameter');
  }

  // 🛡️ CRITICAL SAFETY CHECK: Prevent admins from removing themselves
  if (userId === user.id) {
    throw apiError.forbidden('Security violation: Admins cannot remove their own role. This prevents system lockout.');
  }

  const adminSupabase = createSupabaseAdminClient();
  
  // 🛡️ SAFETY CHECK: Ensure there's at least one admin remaining
  const { count: adminCount, error: countError } = await adminSupabase
    .from('user_roles')
    .select('user_id', { count: 'exact', head: true })
    .eq('role', 'admin');

  if (countError) {
    throw apiError.internal('Failed to check admin count');
  }

  if (adminCount && adminCount <= 1) {
    throw apiError.forbidden('Cannot remove role: At least one admin must remain in the system');
  }

  // 🛡️ SAFETY CHECK: Check if the user being removed is an admin
  const { data: targetUser, error: userError } = await adminSupabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .single();

  if (userError) {
    throw apiError.notFound('User not found');
  }

  if (targetUser.role === 'admin' && adminCount && adminCount <= 1) {
    throw apiError.forbidden('Cannot remove the last admin in the system');
  }
  
  // Delete the role record (user will default to 'student')
  const { error } = await adminSupabase
    .from('user_roles')
    .delete()
    .eq('user_id', userId);

  if (error) {
    throw apiError.internal(error.message);
  }

  return success({ 
    user_id: userId, 
    message: 'Role removed, user reverted to default student role' 
  });
});

