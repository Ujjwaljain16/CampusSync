import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabaseServer';

/**
 * GET /api/v2/admin/super/organizations/[orgId]
 * Get a single organization by ID (super admin only)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
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

    const { orgId } = await params;

    // Get organization
    const { data: organization, error: orgError } = await supabase
      .from('organizations')
      .select('*')
      .eq('id', orgId)
      .single();

    if (orgError || !organization) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    }

    return NextResponse.json({ data: organization });
  } catch (error: unknown) {
    console.error('GET /api/v2/admin/super/organizations/[orgId] error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch organization' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/v2/admin/super/organizations/[orgId]
 * Update an organization (super admin only)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
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

    const { orgId } = await params;
    const body = await request.json();
    const { name, slug, type, email, phone, website, address, is_active, is_verified } = body;

    // Build update object (only include provided fields)
    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString()
    };

    if (name !== undefined) updates.name = name;
    if (slug !== undefined) {
      // Sanitize slug
      updates.slug = slug.toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/--+/g, '-')
        .replace(/^-|-$/g, '');
    }
    if (type !== undefined) updates.type = type;
    if (email !== undefined) updates.email = email;
    if (phone !== undefined) updates.phone = phone;
    if (website !== undefined) updates.website = website;
    if (address !== undefined) updates.address = address;
    if (is_active !== undefined) updates.is_active = is_active;
    if (is_verified !== undefined) {
      updates.is_verified = is_verified;
      if (is_verified) {
        updates.verified_at = new Date().toISOString();
      }
    }

    // Update organization
    const { data: organization, error: updateError } = await supabase
      .from('organizations')
      .update(updates)
      .eq('id', orgId)
      .select()
      .single();

    if (updateError) {
      if (updateError.code === '23505') {
        return NextResponse.json(
          { error: 'Organization with this slug or email already exists' },
          { status: 409 }
        );
      }
      throw updateError;
    }

    console.log(`[ORG_UPDATE] ✅ Organization updated: ${orgId}`);

    return NextResponse.json({ data: organization });
  } catch (error: unknown) {
    console.error('PATCH /api/v2/admin/super/organizations/[orgId] error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update organization' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/v2/admin/super/organizations/[orgId]
 * Delete an organization (super admin only)
 * WARNING: This will cascade delete all related data
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
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

    const { orgId } = await params;

    // Prevent deletion of default organization
    if (orgId === '00000000-0000-0000-0000-000000000001') {
      return NextResponse.json(
        { error: 'Cannot delete default organization' },
        { status: 403 }
      );
    }

    // Delete organization (cascade will handle related data)
    const { error: deleteError } = await supabase
      .from('organizations')
      .delete()
      .eq('id', orgId);

    if (deleteError) {
      throw deleteError;
    }

    console.log(`[ORG_DELETE] ✅ Organization deleted: ${orgId}`);

    return NextResponse.json({ message: 'Organization deleted successfully' });
  } catch (error: unknown) {
    console.error('DELETE /api/v2/admin/super/organizations/[orgId] error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete organization' },
      { status: 500 }
    );
  }
}
