import { NextRequest } from 'next/server';
import { success, apiError, parseAndValidateBody } from '@/lib/api';
import { createSupabaseAdminClient } from '@/lib/supabaseServer';

interface AdminSetupBody {
  email: string;
  password: string;
  fullName: string;
  adminKey?: string;
}

export async function POST(req: NextRequest) {
  const supabase = createSupabaseAdminClient();

  const result = await parseAndValidateBody<AdminSetupBody>(req, ['email', 'password', 'fullName']);
  if (result.error) return result.error;

  const { email, password, fullName, adminKey } = result.data;

  // Check if admin key is provided (for security)
  const expectedAdminKey = process.env.ADMIN_SETUP_KEY || 'campusync-admin-setup-2024';
  
  // For first admin creation, allow without key if no admins exist
  if (adminKey !== expectedAdminKey) {
    // Check if any admin already exists
    const { data: existingAdmins, error: checkError } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('role', 'admin')
      .limit(1);

    if (checkError || (existingAdmins && existingAdmins.length > 0)) {
      throw apiError.forbidden('Invalid admin setup key');
    }
    // If no admins exist, allow creation without key (first admin only)
  }

  // Check if any admin already exists
  const { data: existingAdmins, error: checkError } = await supabase
    .from('user_roles')
    .select('user_id')
    .eq('role', 'admin')
    .limit(1);

  if (checkError) {
    console.error('Error checking existing admins:', checkError);
    throw apiError.internal('Failed to check existing admins');
  }

  if (existingAdmins && existingAdmins.length > 0) {
    throw apiError.badRequest('Admin already exists. Use the admin dashboard to create additional admins.');
  }

  // Create admin user
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email: email.trim().toLowerCase(),
    password: password,
    email_confirm: true,
    user_metadata: {
      full_name: fullName,
      role: 'admin'
    }
  });

  if (authError) {
    console.error('Error creating admin user:', authError);
    throw apiError.internal(`Failed to create admin user: ${authError.message}`);
  }

  // Assign admin role
  const { error: roleError } = await supabase
    .from('user_roles')
    .insert({
      user_id: authData.user.id,
      role: 'admin',
      assigned_by: authData.user.id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

  if (roleError) {
    console.error('Error assigning admin role:', roleError);
    throw apiError.internal(`Failed to assign admin role: ${roleError.message}`);
  }

  // Add admin domain to allowed domains if it's educational
  const domain = email.split('@')[1];
  const personalDomains = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com'];
  
  if (domain && !personalDomains.includes(domain)) {
    try {
      await supabase.from('allowed_domains').insert({
        domain: domain,
        description: `Admin domain for ${fullName}`,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
    } catch (domainError) {
      console.error('Error adding domain:', domainError);
      // Don't fail if domain insert fails
    }
  }

  return success({
    success: true,
    userId: authData.user.id,
    email: authData.user.email,
    fullName: fullName,
    role: 'admin'
  }, 'First admin user created successfully', 201);
}

// GET - Check if admin setup is needed
export async function GET() {
  const supabase = createSupabaseAdminClient();
  
  const { data: existingAdmins, error } = await supabase
    .from('user_roles')
    .select('user_id')
    .eq('role', 'admin')
    .limit(1);

  if (error) {
    console.error('Error checking admin status:', error);
    throw apiError.internal('Failed to check admin status');
  }

  const needsSetup = !existingAdmins || existingAdmins.length === 0;

  return success({
    needsSetup,
    message: needsSetup 
      ? 'No admin users found. Setup required.' 
      : 'Admin users exist. Setup not needed.'
  });
}

