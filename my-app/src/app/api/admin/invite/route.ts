import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient, requireRole } from '../../../../../lib/supabaseServer';

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
  
  try {
    // Check if user already exists
    const { data: existingUser } = await supabase.auth.admin.getUserByEmail(body.email);
    
    if (existingUser.user) {
      // User exists, assign role directly
      const { error: roleError } = await supabase
        .from('user_roles')
        .upsert({
          user_id: existingUser.user.id,
          role: body.role,
          assigned_by: auth.user.id,
          updated_at: new Date().toISOString()
        });
      
      if (roleError) {
        return NextResponse.json({ error: roleError.message }, { status: 500 });
      }
      
      return NextResponse.json({ 
        data: { 
          message: `Role '${body.role}' assigned to existing user ${body.email}`,
          user_id: existingUser.user.id
        } 
      });
    } else {
      // User doesn't exist, send invitation
      const { data: inviteData, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(
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
