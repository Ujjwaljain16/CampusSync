import { withAuth, success } from '@/lib/api';
import { createSupabaseServerClient } from '@/lib/supabaseServer';

export const GET = withAuth(async (_req, { user }) => {
  const supabase = await createSupabaseServerClient();
  
  // Get user's role from user_roles table
  const { data: roleData, error: roleError } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .single();
  
  if (roleError) {
    // No role assigned yet, still pending
    return success({ 
      role: null, 
      status: 'pending',
      message: 'Role request pending approval'
    });
  }
  
  // Return the user's current role
  return success({ 
    role: roleData.role,
    status: 'approved',
    userId: user.id
  });
});
