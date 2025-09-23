import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '../../../../../lib/supabaseServer';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, role, adminEmail } = body;

    if (!userId || !role || !adminEmail) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (!['student', 'faculty', 'admin'].includes(role)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
    }

    // Verify admin email is authorized
    const authorizedAdminEmails = [
      'jainujjwal1609@gmail.com',
      // Add more admin emails here
    ];

    if (!authorizedAdminEmails.includes(adminEmail)) {
      return NextResponse.json({ error: 'Unauthorized admin email' }, { status: 403 });
    }

    const supabase = createSupabaseAdminClient();

    // Get admin user ID by querying auth.users table
    const { data: adminUser, error: adminError } = await supabase
      .from('auth.users')
      .select('id')
      .eq('email', adminEmail)
      .single();
    
    if (adminError || !adminUser) {
      return NextResponse.json({ error: 'Admin user not found' }, { status: 404 });
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
      return NextResponse.json({ error: roleError.message }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true, 
      message: `Role '${role}' assigned successfully` 
    });

  } catch (error: any) {
    console.error('Error assigning role:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
