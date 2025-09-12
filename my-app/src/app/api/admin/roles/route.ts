import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient, requireRole, createSupabaseAdminClient } from '../../../../../lib/supabaseServer';

// GET /api/admin/roles - List all users and their roles
export async function GET(_req: NextRequest) {
  const auth = await requireRole(['admin']);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const adminSupabase = createSupabaseAdminClient();
  
  // Get all users with their roles using admin client to bypass RLS
  const { data: users, error } = await adminSupabase
    .from('user_roles')
    .select(`
      user_id,
      role,
      created_at,
      updated_at,
      assigned_by
    `)
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: users });
}

// POST /api/admin/roles - Assign or update user role
export async function POST(req: NextRequest) {
  const auth = await requireRole(['admin']);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const body = await req.json().catch(() => null);
  if (!body || !body.user_id || !body.role) {
    return NextResponse.json({ error: 'Missing user_id or role' }, { status: 400 });
  }

  if (!['student', 'faculty', 'admin'].includes(body.role)) {
    return NextResponse.json({ error: 'Invalid role. Must be student, faculty, or admin' }, { status: 400 });
  }

  // 🛡️ SAFETY CHECK: Prevent admins from demoting themselves
  if (body.user_id === auth.user.id && body.role !== 'admin') {
    return NextResponse.json({ 
      error: 'Security violation: Admins cannot demote themselves. This prevents system lockout.' 
    }, { status: 403 });
  }

  const adminSupabase = createSupabaseAdminClient();
  
  // Check if user exists using admin client
  const { data: userExists, error: userError } = await adminSupabase
    .from('user_roles')
    .select('user_id')
    .eq('user_id', body.user_id)
    .single();

  if (userError && userError.code !== 'PGRST116') { // PGRST116 = no rows found
    return NextResponse.json({ error: userError.message }, { status: 500 });
  }

  const now = new Date().toISOString();
  
  if (userExists) {
    // Update existing role
    const { error } = await adminSupabase
      .from('user_roles')
      .update({
        role: body.role,
        assigned_by: auth.user.id,
        updated_at: now
      })
      .eq('user_id', body.user_id);
    
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  } else {
    // Insert new role
    const { error } = await adminSupabase
      .from('user_roles')
      .insert({
        user_id: body.user_id,
        role: body.role,
        assigned_by: auth.user.id,
        created_at: now,
        updated_at: now
      });
    
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ 
    data: { 
      user_id: body.user_id, 
      role: body.role,
      message: 'Role updated successfully' 
    } 
  });
}

// DELETE /api/admin/roles - Remove user role (revert to default student)
export async function DELETE(req: NextRequest) {
  const auth = await requireRole(['admin']);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const { searchParams } = new URL(req.url);
  const userId = searchParams.get('user_id');
  
  if (!userId) {
    return NextResponse.json({ error: 'Missing user_id parameter' }, { status: 400 });
  }

  // 🛡️ CRITICAL SAFETY CHECK: Prevent admins from removing themselves
  if (userId === auth.user.id) {
    return NextResponse.json({ 
      error: 'Security violation: Admins cannot remove their own role. This prevents system lockout.' 
    }, { status: 403 });
  }

  const adminSupabase = createSupabaseAdminClient();
  
  // 🛡️ SAFETY CHECK: Ensure there's at least one admin remaining
  const { data: adminCount, error: countError } = await adminSupabase
    .from('user_roles')
    .select('user_id', { count: 'exact', head: true })
    .eq('role', 'admin');

  if (countError) {
    return NextResponse.json({ error: 'Failed to check admin count' }, { status: 500 });
  }

  if (adminCount && adminCount <= 1) {
    return NextResponse.json({ 
      error: 'Cannot remove role: At least one admin must remain in the system' 
    }, { status: 403 });
  }

  // 🛡️ SAFETY CHECK: Check if the user being removed is an admin
  const { data: targetUser, error: userError } = await adminSupabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .single();

  if (userError) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  if (targetUser.role === 'admin' && adminCount && adminCount <= 1) {
    return NextResponse.json({ 
      error: 'Cannot remove the last admin in the system' 
    }, { status: 403 });
  }
  
  // Delete the role record (user will default to 'student')
  const { error } = await adminSupabase
    .from('user_roles')
    .delete()
    .eq('user_id', userId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ 
    data: { 
      user_id: userId, 
      message: 'Role removed, user reverted to default student role' 
    } 
  });
}
