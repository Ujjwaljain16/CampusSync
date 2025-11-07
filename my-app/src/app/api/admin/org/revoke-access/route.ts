import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabaseServer';

/**
 * POST /api/admin/org/revoke-access
 * 
 * Revoke a recruiter's access to the organization.
 * Body: { recruiterId, reason? }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user's org admin role
    const { data: userRole, error: roleError } = await supabase
      .from('user_roles')
      .select('role, organization_id')
      .eq('user_id', user.id)
      .in('role', ['org_admin', 'admin'])
      .not('organization_id', 'is', null)
      .maybeSingle();

    if (roleError || !userRole) {
      return NextResponse.json(
        { error: 'Organization admin access required' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { recruiterId, reason } = body;

    if (!recruiterId) {
      return NextResponse.json(
        { error: 'recruiterId is required' },
        { status: 400 }
      );
    }

    // Find approved access for this recruiter and org
    const { data: accessRecord, error: fetchError } = await supabase
      .from('recruiter_org_access')
      .select('id, status')
      .eq('recruiter_user_id', recruiterId)
      .eq('organization_id', userRole.organization_id)
      .eq('status', 'approved')
      .maybeSingle();

    if (fetchError) {
      console.error('[REVOKE_ACCESS] Fetch error:', fetchError);
      return NextResponse.json(
        { error: 'Failed to check access' },
        { status: 500 }
      );
    }

    if (!accessRecord) {
      return NextResponse.json(
        { error: 'No approved access found for this recruiter' },
        { status: 404 }
      );
    }

    // Update to revoked status
    const { error: updateError } = await supabase
      .from('recruiter_org_access')
      .update({
        status: 'revoked',
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
        review_notes: reason || 'Access revoked by organization admin'
      })
      .eq('id', accessRecord.id);

    if (updateError) {
      console.error('[REVOKE_ACCESS] Update failed:', updateError);
      return NextResponse.json(
        { error: 'Failed to revoke access' },
        { status: 500 }
      );
    }

    // Log audit event
    await supabase.from('audit_logs').insert({
      user_id: user.id,
      action: 'recruiter_access_revoked',
      resource_type: 'organization',
      resource_id: userRole.organization_id,
      metadata: {
        recruiter_user_id: recruiterId,
        reason
      }
    });

    return NextResponse.json({
      success: true,
      message: 'Access revoked successfully'
    });

  } catch (error: unknown) {
    console.error('[REVOKE_ACCESS] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
