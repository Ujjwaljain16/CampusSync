import { NextRequest } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabaseServer';
import { success, apiError, parseAndValidateBody } from '@/lib/api';

interface AssignRoleBody {
  userId: string;
  role: string;
  adminEmail: string;
  organizationId?: string; // Optional: specify org, defaults to default org
}

export async function POST(req: NextRequest) {
  const result = await parseAndValidateBody<AssignRoleBody>(req, ['userId', 'role', 'adminEmail']);
  if (result.error) return result.error;
  
  const { userId, role, adminEmail, organizationId: requestedOrgId } = result.data;

  if (!['student', 'faculty', 'admin'].includes(role)) {
    throw apiError.badRequest('Invalid role');
  }

  // Verify admin email is authorized
  const authorizedAdminEmails = [
    'jainujjwal1609@gmail.com',
    // Add more admin emails here
  ];

  if (!authorizedAdminEmails.includes(adminEmail)) {
    throw apiError.forbidden('Unauthorized admin email');
  }

  const supabase = await createSupabaseAdminClient();

  // Get admin user ID by querying auth.users table
  const { data: adminUser, error: adminError } = await supabase
    .from('auth.users')
    .select('id')
    .eq('email', adminEmail)
    .single();
  
  if (adminError || !adminUser) {
    throw apiError.notFound('Admin user not found');
  }

  // Get admin's organization or use specified one
  const { data: adminRole } = await supabase
    .from('user_roles')
    .select('organization_id')
    .eq('user_id', adminUser.id)
    .single();

  const organizationId = requestedOrgId || adminRole?.organization_id;
  
  if (!organizationId) {
    throw apiError.badRequest('organization_id is required. Admin has no organization or none was specified.');
  }

  // Assign role to user with organization
  const { error: roleError } = await supabase
    .from('user_roles')
    .upsert({
      user_id: userId,
      role: role,
      organization_id: organizationId,
      assigned_by: adminUser.id,
      updated_at: new Date().toISOString()
    });

  if (roleError) {
    throw apiError.internal(roleError.message);
  }

  return success({ 
    success: true, 
    message: `Role '${role}' assigned successfully to organization ${organizationId}` 
  });
}

