import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient, requireRole } from '../../../../../lib/supabaseServer';

// GET /api/admin/roles - List all users and their roles
export async function GET(_req: NextRequest) {
  const auth = await requireRole(['admin']);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const supabase = await createSupabaseServerClient();
  
  // Get all users with their roles
  const { data: users, error } = await supabase
    .from('user_roles')
    .select(`
      user_id,
      role,
      created_at,
      updated_at,
      assigned_by,
      auth_users:user_id (
        email,
        created_at
      )
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

  const supabase = await createSupabaseServerClient();
  
  // Check if user exists
  const { data: userExists, error: userError } = await supabase
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
    const { error } = await supabase
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
    const { error } = await supabase
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

  const supabase = await createSupabaseServerClient();
  
  // Delete the role record (user will default to 'student')
  const { error } = await supabase
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
