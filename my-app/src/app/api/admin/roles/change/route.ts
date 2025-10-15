import { NextRequest } from 'next/server';
import { withRole, success, apiError, parseAndValidateBody } from '@/lib/api';
import { createSupabaseAdminClient } from '@/lib/supabaseServer';

interface RoleChangeRequest {
  user_id: string;
  new_role: 'student' | 'faculty' | 'recruiter' | 'admin';
  reason?: string;
  transfer_data?: boolean; // Whether to transfer any role-specific data
}

export const POST = withRole(['admin'], async (req: NextRequest, { user }) => {
  const result = await parseAndValidateBody<RoleChangeRequest>(req, ['user_id', 'new_role']);
  if (result.error) return result.error;

  const body = result.data;

  if (!['student', 'faculty', 'recruiter', 'admin'].includes(body.new_role)) {
    throw apiError.badRequest('Invalid role');
  }

  // 🛡️ SAFETY CHECK: Prevent admin self-demotion
  if (body.user_id === user.id && body.new_role !== 'admin') {
    throw apiError.forbidden('Security violation: Admins cannot demote themselves');
  }

  const adminSupabase = createSupabaseAdminClient();

  // 🛡️ SAFETY CHECK: Prevent demoting the last admin
  const { count: adminCountValue } = await adminSupabase
    .from('user_roles')
    .select('*', { count: 'exact', head: true })
    .eq('role', 'admin');

  const adminCount = adminCountValue || 0;

  if (adminCount <= 1) {
    throw apiError.forbidden('Cannot demote the last admin in the system');
  }

  // 🛡️ SAFETY CHECK: Check if target user is an admin
  const { data: targetUser, error: targetError } = await adminSupabase
    .from('user_roles')
    .select('role')
    .eq('user_id', body.user_id)
    .single();

  if (targetError && targetError.code !== 'PGRST116') {
    throw apiError.internal('Failed to check target user role');
  }

  const targetRole = targetUser?.role || 'student';

  // If demoting an admin, ensure there will be at least one admin left
  if (targetRole === 'admin' && body.new_role !== 'admin') {
    if (adminCount <= 1) {
      throw apiError.forbidden('Cannot demote the last admin in the system');
    }
  }

  // 🛡️ CRITICAL SAFETY: Prevent super admin demotion
  const { data: isSuperAdmin } = await adminSupabase.rpc('is_super_admin', {
    p_user_id: body.user_id
  });

  if (isSuperAdmin && body.new_role !== 'admin') {
    throw apiError.forbidden('CRITICAL: Cannot demote the super admin (original/founder admin). This admin serves as the system recovery mechanism and cannot be demoted under any circumstances.');
  }

  // 🛡️ ADDITIONAL SAFETY: Require reason for admin demotion
  if (targetRole === 'admin' && body.new_role !== 'admin') {
    if (!body.reason || body.reason.length < 10) {
      throw apiError.badRequest('Admin demotion requires a detailed reason (minimum 10 characters)');
    }
  }
  const now = new Date().toISOString();

  // 1. Get current role
  const { data: currentRole, error: roleError } = await adminSupabase
    .from('user_roles')
    .select('role, created_at')
    .eq('user_id', body.user_id)
    .single();

  if (roleError && roleError.code !== 'PGRST116') {
    throw apiError.internal('Failed to fetch current role');
  }

  const oldRole = currentRole?.role || 'student';

  // 2. Handle role-specific data before change
  await handleRoleSpecificData(adminSupabase, body.user_id, oldRole, body.new_role);

  // 3. Update the role
  if (currentRole) {
    // Update existing role
    const { error: updateError } = await adminSupabase
      .from('user_roles')
      .update({
        role: body.new_role,
        assigned_by: user.id,
        updated_at: now
      })
      .eq('user_id', body.user_id);

    if (updateError) {
      throw apiError.internal(updateError.message);
    }
  } else {
    // Insert new role
    const { error: insertError } = await adminSupabase
      .from('user_roles')
      .insert({
        user_id: body.user_id,
        role: body.new_role,
        assigned_by: user.id,
        created_at: now,
        updated_at: now
      });

    if (insertError) {
      throw apiError.internal(insertError.message);
    }
  }

  // 4. Log the role change
  await adminSupabase.from('audit_logs').insert({
    actor_id: user.id,
    user_id: body.user_id,
    action: 'role_change',
    target_id: body.user_id,
    details: {
      old_role: oldRole,
      new_role: body.new_role,
      reason: body.reason || 'No reason provided',
      changed_by: user.id,
      timestamp: now
    },
    created_at: now
  });

  // 5. Handle post-change actions
  await handlePostRoleChange(adminSupabase, body.user_id, oldRole, body.new_role);

  return success({ 
    user_id: body.user_id,
    old_role: oldRole,
    new_role: body.new_role,
    message: 'Role changed successfully',
    data_handling: 'User data preserved, access permissions updated'
  });
});

async function handleRoleSpecificData(
  supabase: ReturnType<typeof createSupabaseAdminClient>, 
  userId: string, 
  oldRole: string, 
  newRole: string
) {
  // Handle data that needs special treatment during role changes
  
  if (oldRole === 'recruiter' && newRole !== 'recruiter') {
    // Recruiter being demoted - ensure no cached access
    console.log(`Recruiter ${userId} demoted to ${newRole} - clearing recruiter-specific data`);
    
    // Could add logic here to clear any recruiter-specific cached data
    // For now, RLS policies handle this automatically
  }

  if (oldRole === 'faculty' && newRole !== 'faculty') {
    // Faculty being demoted - handle any faculty-specific data
    console.log(`Faculty ${userId} demoted to ${newRole} - clearing faculty-specific data`);
    
    // Could add logic here to handle faculty-specific data
    // For now, RLS policies handle this automatically
  }

  if (oldRole === 'admin' && newRole !== 'admin') {
    // Admin being demoted - critical security check
    console.log(`Admin ${userId} demoted to ${newRole} - ensuring admin access is revoked`);
    
    // Ensure at least one admin remains
    const { count: adminCountValue } = await supabase
      .from('user_roles')
      .select('*', { count: 'exact', head: true })
      .eq('role', 'admin');
    
    const adminCountCheck = adminCountValue || 0;
    if (adminCountCheck <= 1) {
      throw new Error('Cannot demote the last admin in the system');
    }
  }
}

async function handlePostRoleChange(
  supabase: ReturnType<typeof createSupabaseAdminClient>, 
  userId: string, 
  oldRole: string, 
  newRole: string
) {
  // Handle any post-role-change actions
  
  if (newRole === 'student') {
    // User is now a student - ensure they have a complete profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, university, graduation_year, major')
      .eq('id', userId)
      .single();
    
    if (!profile || !profile.full_name || !profile.university || !profile.graduation_year || !profile.major) {
      console.log(`Student ${userId} has incomplete profile - they will be redirected to onboarding`);
    }
  }

  // Could add email notifications here
  // Could add cache invalidation here
  // Could add session refresh requirements here
}

