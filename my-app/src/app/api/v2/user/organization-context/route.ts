/**
 * Organization Context API Endpoint
 * 
 * Returns the current user's organization context for frontend validation.
 */

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabaseServer';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get user's role and organization
    const { data: userRole, error: roleError } = await supabase
      .from('user_roles')
      .select('organization_id, role')
      .eq('user_id', user.id)
      .single();

    if (roleError || !userRole) {
      console.error('[ORG_CONTEXT] Failed to fetch user role:', roleError);
      return NextResponse.json(
        { error: 'Failed to fetch organization context' },
        { status: 500 }
      );
    }

    // Return organization context
    return NextResponse.json({
      userId: user.id,
      organizationId: userRole.organization_id,
      role: userRole.role,
      isSuperAdmin: userRole.role === 'super_admin'
    });
  } catch (error) {
    console.error('[ORG_CONTEXT] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
