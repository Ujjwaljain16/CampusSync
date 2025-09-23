import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '../../../../lib/supabaseServer';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const email = searchParams.get('email');
  
  if (!email) {
    return NextResponse.json({ error: 'Email parameter required' }, { status: 400 });
  }

  try {
    const adminSupabase = createSupabaseAdminClient();
    
    // Get all users to find the invited user
    const { data: usersData, error: listError } = await adminSupabase.auth.admin.listUsers({
      page: 1,
      perPage: 1000
    });
    
    if (listError) {
      return NextResponse.json({ error: listError.message }, { status: 500 });
    }
    
    const user = usersData.users.find(u => u.email === email);
    
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    
    // Check if user has been invited (has invitation metadata)
    const invitedRole = user.user_metadata?.invited_role;
    const invitedBy = user.user_metadata?.invited_by;
    
    if (!invitedRole) {
      return NextResponse.json({ 
        message: 'User exists but was not invited through the invitation system',
        user_id: user.id,
        email: user.email,
        created_at: user.created_at
      });
    }
    
    // For testing, we'll create a direct signup link
    // In production, this would be handled by Supabase's email system
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
    const signupUrl = `${baseUrl}/login?email=${encodeURIComponent(email)}&invited=true`;
    
    return NextResponse.json({
      message: 'Invitation found!',
      user_id: user.id,
      email: user.email,
      invited_role: invitedRole,
      invited_by: invitedBy,
      created_at: user.created_at,
      test_signup_url: signupUrl,
      instructions: [
        '1. Copy the test_signup_url above',
        '2. Open it in a new browser tab or incognito window',
        '3. Sign up with the invited email address',
        '4. The user will automatically get the assigned role'
      ]
    });
    
  } catch (error) {
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Failed to check invitation' 
    }, { status: 500 });
  }
}

