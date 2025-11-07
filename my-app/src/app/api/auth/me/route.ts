import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabaseServer';

/**
 * GET /api/auth/me
 * 
 * Get current user's profile and role information
 */
export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    // Get user's role
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role, organization_id, approval_status')
      .eq('user_id', user.id)
      .single();

    // Get user's profile
    const { data: profileData } = await supabase
      .from('profiles')
      .select('full_name, email, organization_id')
      .eq('user_id', user.id)
      .single();

    return NextResponse.json({
      user_id: user.id,
      email: user.email,
      role: roleData?.role || null,
      organization_id: roleData?.organization_id || profileData?.organization_id || null,
      approval_status: roleData?.approval_status || null,
      full_name: profileData?.full_name || null,
    });

  } catch (error: unknown) {
    console.error('[AUTH-ME] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
