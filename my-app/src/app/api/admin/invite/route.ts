import { NextRequest } from 'next/server';
import { withRole, success, apiError, parseAndValidateBody, getOrganizationContext, isRecruiterContext } from '@/lib/api';
import { createSupabaseAdminClient, createSupabaseServerClient } from '@/lib/supabaseServer';

interface InviteBody {
  email: string;
  role: string;
  organizationId?: string; // Optional: invite to specific organization
}

// POST /api/admin/invite - Send admin invitation email
export const POST = withRole(['admin', 'org_admin', 'super_admin'], async (req: NextRequest, { user }) => {
  const result = await parseAndValidateBody<InviteBody>(req, ['email', 'role']);
  if (result.error) return result.error;

  const { email, role, organizationId } = result.data;

  if (!['student', 'faculty', 'admin', 'org_admin', 'recruiter'].includes(role)) {
    throw apiError.badRequest('Invalid role');
  }

  // Get organization context for multi-tenancy
  await createSupabaseServerClient();
  const orgContext = await getOrganizationContext(user, organizationId);
  
  // Get organization ID for single-org contexts
  const contextOrgId = isRecruiterContext(orgContext) 
    ? orgContext.selectedOrganization || orgContext.accessibleOrganizations[0]
    : orgContext.organizationId;
  
  // Verify user has permission to invite to this organization
  if (organizationId && organizationId !== contextOrgId && !orgContext.isSuperAdmin) {
    throw apiError.forbidden('You do not have permission to invite users to this organization');
  }

  const targetOrgId = organizationId || contextOrgId;
  const adminSupabase = await createSupabaseAdminClient();
  
  // Check if user already exists using listUsers
  const { data: usersData, error: listError } = await adminSupabase.auth.admin.listUsers({
    page: 1,
    perPage: 1000
  });
  
  if (listError) {
    console.error('Error listing users:', listError);
    throw apiError.internal(listError.message);
  }
  
  const existingUser = usersData.users.find((u: { email?: string }) => u.email === email);
  
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
      // User exists but has no role, insert new role with organization
      const { error: insertError } = await adminSupabase
        .from('user_roles')
        .insert({
          user_id: existingUser.id,
          organization_id: targetOrgId, // Multi-org support
          role,
          assigned_by: user.id,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
      
      if (insertError) {
        console.error('Error inserting role:', insertError);
        throw apiError.internal(insertError.message);
      }
      
      // Update profile with organization if needed
      await adminSupabase
        .from('profiles')
        .upsert({
          id: existingUser.id,
          organization_id: targetOrgId,
          role: role,
          updated_at: new Date().toISOString()
        }, { onConflict: 'id' });
      
      return success({ 
        message: `Role '${role}' assigned to existing user ${email}`,
        user_id: existingUser.id,
        organization_id: targetOrgId
      });
    }
  } else {
    // User doesn't exist, send invitation
    const { data: inviteData, error: inviteError } = await adminSupabase.auth.admin.inviteUserByEmail(
      email,
      {
        data: {
          invited_role: role,
          invited_by: user.id,
          organization_id: targetOrgId // Multi-org support
        }
      }
    );
    
    if (inviteError) {
      console.error('Error sending invitation:', inviteError);
      throw apiError.internal(inviteError.message);
    }
    
    // Pre-create user_role entry for invited user
    if (inviteData.user?.id) {
      await adminSupabase
        .from('user_roles')
        .insert({
          user_id: inviteData.user.id,
          organization_id: targetOrgId, // Multi-org support
          role,
          assigned_by: user.id,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
    }
    
    return success({ 
      message: `Invitation sent to ${email} with role '${role}'`,
      user_id: inviteData.user?.id,
      organization_id: targetOrgId
    }, 'Invitation sent successfully');
  }
});

