import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabaseServer';

/**
 * DELETE /api/v2/admin/super/organizations/[orgId]/admins/[adminId]
 * Remove an admin from an organization (super admin only)
 * Cannot remove primary admins
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string; adminId: string }> }
) {
  try {
    const supabase = await createSupabaseServerClient();

    // Check if user is super admin
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: userRole, error: roleError } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    if (roleError || userRole?.role !== 'super_admin') {
      return NextResponse.json({ error: 'Super admin access required' }, { status: 403 });
    }

    const { orgId, adminId } = await params;

    // Check if admin exists and is not primary admin
    const { data: adminRole, error: adminCheckError } = await supabase
      .from('user_roles')
      .select('role, is_primary_admin')
      .eq('user_id', adminId)
      .eq('organization_id', orgId)
      .single();

    if (adminCheckError || !adminRole) {
      return NextResponse.json({ error: 'Admin not found in this organization' }, { status: 404 });
    }

    if (adminRole.is_primary_admin) {
      return NextResponse.json(
        { 
          error: 'Cannot remove primary admin',
          message: 'Primary admins cannot be removed. Transfer primary admin status first.'
        },
        { status: 403 }
      );
    }

    // Remove admin role
    const { error: deleteError } = await supabase
      .from('user_roles')
      .delete()
      .eq('user_id', adminId)
      .eq('organization_id', orgId);

    if (deleteError) {
      throw deleteError;
    }

    console.log(`[REMOVE_ADMIN] ✅ Admin removed: ${adminId} from org ${orgId}`);

    return NextResponse.json({ message: 'Admin removed successfully' });
  } catch (error: unknown) {
    console.error('DELETE /api/v2/admin/super/organizations/[orgId]/admins/[adminId] error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to remove admin' },
      { status: 500 }
    );
  }
}
