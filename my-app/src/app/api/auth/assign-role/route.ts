import { NextRequest } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabaseServer';
import { success, apiError, parseAndValidateBody } from '@/lib/api';

interface AssignRoleBody {
  userId: string;
  role: string;
  adminEmail: string;
}

export async function POST(req: NextRequest) {
  const result = await parseAndValidateBody<AssignRoleBody>(req, ['userId', 'role', 'adminEmail']);
  if (result.error) return result.error;
  
  const { userId, role, adminEmail } = result.data;

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

  const supabase = createSupabaseAdminClient();

  // Get admin user ID by querying auth.users table
  const { data: adminUser, error: adminError } = await supabase
    .from('auth.users')
    .select('id')
    .eq('email', adminEmail)
    .single();
  
  if (adminError || !adminUser) {
    throw apiError.notFound('Admin user not found');
  }

  // Assign role to user
  const { error: roleError } = await supabase
    .from('user_roles')
    .upsert({
      user_id: userId,
      role: role,
      assigned_by: adminUser.id,
      updated_at: new Date().toISOString()
    });

  if (roleError) {
    throw apiError.internal(roleError.message);
  }

  return success({ 
    success: true, 
    message: `Role '${role}' assigned successfully` 
  });
}

