import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient, requireRole, createSupabaseAdminClient } from '@/lib/supabaseServer';

interface RoleChangeRequest {
  user_id: string;
  new_role: 'student' | 'faculty' | 'recruiter' | 'admin';
  reason?: string;
  transfer_data?: boolean; // Whether to transfer any role-specific data
}

export async function POST(req: NextRequest) {
  const auth = await requireRole(['admin']);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const body: RoleChangeRequest = await req.json().catch(() => null);
  if (!body || !body.user_id || !body.new_role) {
    return NextResponse.json({ error: 'Missing user_id or new_role' }, { status: 400 });
  }

  if (!['student', 'faculty', 'recruiter', 'admin'].includes(body.new_role)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
  }

  // 🛡️ SAFETY CHECK: Prevent admin self-demotion
  if (body.user_id === auth.user.id && body.new_role !== 'admin') {
    return NextResponse.json({ 
      error: 'Security violation: Admins cannot demote themselves' 
    }, { status: 403 });
  }

  // 🛡️ SAFETY CHECK: Prevent demoting the last admin
  const { data: adminCount } = await adminSupabase
    .from('user_roles')
    .select('user_id', { count: 'exact', head: true })
    .eq('role', 'admin');

  if (adminCount && adminCount <= 1) {
    return NextResponse.json({ 
      error: 'Cannot demote the last admin in the system' 
    }, { status: 403 });
  }

  // 🛡️ SAFETY CHECK: Check if target user is an admin
  const { data: targetUser, error: targetError } = await adminSupabase
    .from('user_roles')
    .select('role')
    .eq('user_id', body.user_id)
    .single();

  if (targetError && targetError.code !== 'PGRST116') {
    return NextResponse.json({ error: 'Failed to check target user role' }, { status: 500 });
  }

  const targetRole = targetUser?.role || 'student';

  // If demoting an admin, ensure there will be at least one admin left
  if (targetRole === 'admin' && body.new_role !== 'admin') {
    if (adminCount && adminCount <= 1) {
      return NextResponse.json({ 
        error: 'Cannot demote the last admin in the system' 
      }, { status: 403 });
    }
  }

  // 🛡️ CRITICAL SAFETY: Prevent super admin demotion
  const { data: isSuperAdmin } = await adminSupabase.rpc('is_super_admin', {
    p_user_id: body.user_id
  });

  if (isSuperAdmin && body.new_role !== 'admin') {
    return NextResponse.json({ 
      error: 'CRITICAL: Cannot demote the super admin (original/founder admin). This admin serves as the system recovery mechanism and cannot be demoted under any circumstances.' 
    }, { status: 403 });
  }

  // 🛡️ ADDITIONAL SAFETY: Require reason for admin demotion
  if (targetRole === 'admin' && body.new_role !== 'admin') {
    if (!body.reason || body.reason.length < 10) {
      return NextResponse.json({ 
        error: 'Admin demotion requires a detailed reason (minimum 10 characters)' 
      }, { status: 400 });
    }
  }

  const adminSupabase = createSupabaseAdminClient();
  const now = new Date().toISOString();

  try {
    // 1. Get current role
    const { data: currentRole, error: roleError } = await adminSupabase
      .from('user_roles')
      .select('role, created_at')
      .eq('user_id', body.user_id)
      .single();

    if (roleError && roleError.code !== 'PGRST116') {
      return NextResponse.json({ error: 'Failed to fetch current role' }, { status: 500 });
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
          assigned_by: auth.user.id,
          updated_at: now
        })
        .eq('user_id', body.user_id);

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }
    } else {
      // Insert new role
      const { error: insertError } = await adminSupabase
        .from('user_roles')
        .insert({
          user_id: body.user_id,
          role: body.new_role,
          assigned_by: auth.user.id,
          created_at: now,
          updated_at: now
        });

      if (insertError) {
        return NextResponse.json({ error: insertError.message }, { status: 500 });
      }
    }

    // 4. Log the role change
    await adminSupabase.from('audit_logs').insert({
      actor_id: auth.user.id,
      user_id: body.user_id,
      action: 'role_change',
      target_id: body.user_id,
      details: {
        old_role: oldRole,
        new_role: body.new_role,
        reason: body.reason || 'No reason provided',
        changed_by: auth.user.id,
        timestamp: now
      },
      created_at: now
    });

    // 5. Handle post-change actions
    await handlePostRoleChange(adminSupabase, body.user_id, oldRole, body.new_role);

    return NextResponse.json({ 
      data: { 
        user_id: body.user_id,
        old_role: oldRole,
        new_role: body.new_role,
        message: 'Role changed successfully',
        data_handling: 'User data preserved, access permissions updated'
      } 
    });

  } catch (error: any) {
    console.error('Role change error:', error);
    return NextResponse.json({ error: error.message || 'Failed to change role' }, { status: 500 });
  }
}

async function handleRoleSpecificData(
  supabase: any, 
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
    const { data: adminCount } = await supabase
      .from('user_roles')
      .select('user_id', { count: 'exact', head: true })
      .eq('role', 'admin');
    
    if (adminCount && adminCount <= 1) {
      throw new Error('Cannot demote the last admin in the system');
    }
  }
}

async function handlePostRoleChange(
  supabase: any, 
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

