import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient, createSupabaseAdminClient, requireRole } from '@/lib/supabaseServer';

// POST /api/admin/invite - Send admin invitation email
export async function POST(req: NextRequest) {
  const auth = await requireRole(['admin']);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const body = await req.json().catch(() => null);
  if (!body || !body.email || !body.role) {
    return NextResponse.json({ error: 'Missing email or role' }, { status: 400 });
  }

  if (!['student', 'faculty', 'admin'].includes(body.role)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const adminSupabase = createSupabaseAdminClient();
  
  try {
    // Check if user already exists using listUsers (since getUserByEmail doesn't exist)
    const { data: usersData, error: listError } = await adminSupabase.auth.admin.listUsers({
      page: 1,
      perPage: 1000
    });
    
    if (listError) {
      return NextResponse.json({ error: listError.message }, { status: 500 });
    }
    
    const existingUser = usersData.users.find(user => user.email === body.email);
    
    if (existingUser) {
      // User exists, check if they already have a role (use admin client to bypass RLS)
      const { data: existingRole, error: roleCheckError } = await adminSupabase
        .from('user_roles')
        .select('role')
        .eq('user_id', existingUser.id)
        .single();
      
      if (roleCheckError && roleCheckError.code !== 'PGRST116') {
        return NextResponse.json({ error: roleCheckError.message }, { status: 500 });
      }
      
      if (existingRole) {
        // User already has a role, update it (admin client)
        const { error: updateError } = await adminSupabase
          .from('user_roles')
          .update({
            role: body.role,
            assigned_by: auth.user.id,
            updated_at: new Date().toISOString()
          })
          .eq('user_id', existingUser.id);
        
        if (updateError) {
          return NextResponse.json({ error: updateError.message }, { status: 500 });
        }
        
        return NextResponse.json({ 
          data: { 
            message: `Role updated to '${body.role}' for existing user ${body.email}`,
            user_id: existingUser.id,
            previous_role: existingRole.role
          } 
        });
      } else {
        // User exists but has no role, insert new role (admin client)
        const { error: insertError } = await adminSupabase
          .from('user_roles')
          .insert({
            user_id: existingUser.id,
            role: body.role,
            assigned_by: auth.user.id,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });
        
        if (insertError) {
          return NextResponse.json({ error: insertError.message }, { status: 500 });
        }
        
        return NextResponse.json({ 
          data: { 
            message: `Role '${body.role}' assigned to existing user ${body.email}`,
            user_id: existingUser.id
          } 
        });
      }
    } else {
      // User doesn't exist, send invitation
      const { data: inviteData, error: inviteError } = await adminSupabase.auth.admin.inviteUserByEmail(
        body.email,
        {
          data: {
            invited_role: body.role,
            invited_by: auth.user.id
          }
        }
      );
      
      if (inviteError) {
        return NextResponse.json({ error: inviteError.message }, { status: 500 });
      }
      
      return NextResponse.json({ 
        data: { 
          message: `Invitation sent to ${body.email} with role '${body.role}'`,
          user_id: inviteData.user?.id
        } 
      });
    }
  } catch (error) {
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Failed to process invitation' 
    }, { status: 500 });
  }
}

