import { NextRequest } from 'next/server';
import { withRole, success, apiError, parseAndValidateBody } from '@/lib/api';
import { createSupabaseAdminClient } from '@/lib/supabaseServer';

interface InviteBody {
  email: string;
  role: string;
}

// POST /api/admin/invite - Send admin invitation email
export const POST = withRole(['admin'], async (req: NextRequest, { user }) => {
  const result = await parseAndValidateBody<InviteBody>(req, ['email', 'role']);
  if (result.error) return result.error;

  const { email, role } = result.data;

  if (!['student', 'faculty', 'admin'].includes(role)) {
    throw apiError.badRequest('Invalid role');
  }

  const adminSupabase = createSupabaseAdminClient();
  
  // Check if user already exists using listUsers
  const { data: usersData, error: listError } = await adminSupabase.auth.admin.listUsers({
    page: 1,
    perPage: 1000
  });
  
  if (listError) {
    console.error('Error listing users:', listError);
    throw apiError.internal(listError.message);
  }
  
  const existingUser = usersData.users.find(u => u.email === email);
  
  if (existingUser) {
    // User exists, check if they already have a role
    const { data: existingRole, error: roleCheckError } = await adminSupabase
      .from('user_roles')
      .select('role')
      .eq('user_id', existingUser.id)
      .single();
    
    if (roleCheckError && roleCheckError.code !== 'PGRST116') {
      console.error('Error checking role:', roleCheckError);
      throw apiError.internal(roleCheckError.message);
    }
    
    if (existingRole) {
      // User already has a role, update it
      const { error: updateError } = await adminSupabase
        .from('user_roles')
        .update({
          role,
          assigned_by: user.id,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', existingUser.id);
      
      if (updateError) {
        console.error('Error updating role:', updateError);
        throw apiError.internal(updateError.message);
      }
      
      return success({ 
        message: `Role updated to '${role}' for existing user ${email}`,
        user_id: existingUser.id,
        previous_role: existingRole.role
      });
    } else {
      // User exists but has no role, insert new role
      const { error: insertError } = await adminSupabase
        .from('user_roles')
        .insert({
          user_id: existingUser.id,
          role,
          assigned_by: user.id,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
      
      if (insertError) {
        console.error('Error inserting role:', insertError);
        throw apiError.internal(insertError.message);
      }
      
      return success({ 
        message: `Role '${role}' assigned to existing user ${email}`,
        user_id: existingUser.id
      });
    }
  } else {
    // User doesn't exist, send invitation
    const { data: inviteData, error: inviteError } = await adminSupabase.auth.admin.inviteUserByEmail(
      email,
      {
        data: {
          invited_role: role,
          invited_by: user.id
        }
      }
    );
    
    if (inviteError) {
      console.error('Error sending invitation:', inviteError);
      throw apiError.internal(inviteError.message);
    }
    
    return success({ 
      message: `Invitation sent to ${email} with role '${role}'`,
      user_id: inviteData.user?.id
    }, 'Invitation sent successfully');
  }
});

