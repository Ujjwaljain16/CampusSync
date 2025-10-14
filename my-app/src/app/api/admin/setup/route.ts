import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabaseServer';

export async function POST(req: NextRequest) {
  const supabase = createSupabaseAdminClient(); // Move this to the top

  try {
    const body = await req.json();
    const { email, password, fullName, adminKey } = body;

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
        return NextResponse.json({ 
          error: 'Invalid admin setup key' 
        }, { status: 403 });
      }
      // If no admins exist, allow creation without key (first admin only)
    }

    if (!email || !password || !fullName) {
      return NextResponse.json({ 
        error: 'Email, password, and full name are required' 
      }, { status: 400 });
    }

    // Check if any admin already exists
    const { data: existingAdmins, error: checkError } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('role', 'admin')
      .limit(1);

    if (checkError) {
      return NextResponse.json({ 
        error: 'Failed to check existing admins' 
      }, { status: 500 });
    }

    if (existingAdmins && existingAdmins.length > 0) {
      return NextResponse.json({ 
        error: 'Admin already exists. Use the admin dashboard to create additional admins.' 
      }, { status: 409 });
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
      return NextResponse.json({ 
        error: `Failed to create admin user: ${authError.message}` 
      }, { status: 500 });
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
      return NextResponse.json({ 
        error: `Failed to assign admin role: ${roleError.message}` 
      }, { status: 500 });
    }

    // Add admin domain to allowed domains if it's educational
    const domain = email.split('@')[1];
    const personalDomains = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com'];
    
    if (domain && !personalDomains.includes(domain)) {
      await supabase
        .from('allowed_domains')
        .insert({
          domain: domain,
          description: `Admin domain for ${fullName}`,
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
    }

    return NextResponse.json({
      success: true,
      message: 'First admin user created successfully',
      data: {
        userId: authData.user.id,
        email: authData.user.email,
        fullName: fullName,
        role: 'admin'
      }
    });

  } catch (error: any) {
    console.error('Admin setup error:', error);
    return NextResponse.json({ 
      error: error.message 
    }, { status: 500 });
  }
}

// GET - Check if admin setup is needed
export async function GET(req: NextRequest) {
  try {
    const supabase = createSupabaseAdminClient();
    
    const { data: existingAdmins, error } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('role', 'admin')
      .limit(1);

    if (error) {
      return NextResponse.json({ 
        error: 'Failed to check admin status' 
      }, { status: 500 });
    }

    const needsSetup = !existingAdmins || existingAdmins.length === 0;

    return NextResponse.json({
      needsSetup,
      message: needsSetup 
        ? 'No admin users found. Setup required.' 
        : 'Admin users exist. Setup not needed.'
    });

  } catch (error: any) {
    return NextResponse.json({ 
      error: error.message 
    }, { status: 500 });
  }
}

