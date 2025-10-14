import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClientWithAuth } from '@/lib/supabaseServer';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClientWithAuth(request);
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user role
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    if (!roleData || roleData.role !== 'recruiter') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Return basic recruiter dashboard data
    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        role: 'recruiter'
      },
      analytics: {
        total_verifications: 0,
        successful_verifications: 0,
        pending_verifications: 0,
        verification_rate: 0
      },
      recent_verifications: [],
      message: 'Recruiter dashboard working!'
    });

  } catch (error) {
    console.error('Recruiter dashboard error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}