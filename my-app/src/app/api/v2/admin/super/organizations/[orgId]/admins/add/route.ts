import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabaseServer';

/**
 * POST /api/v2/admin/super/organizations/[orgId]/admins/add
 * Add a new admin to an existing organization (super admin only)
 * 
 * Can either:
 * 1. Create a new user and assign as admin
 * 2. Assign an existing user as admin
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const supabase = await createSupabaseServerClient();
    const adminClient = await createSupabaseAdminClient();

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

    // Verify organization exists
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .select('id, name, primary_admin_id')
      .eq('id', orgId)
      .single();

    if (orgError || !org) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    }

    // Parse request body
    const body = await request.json();
    const { email, password, full_name, role = 'org_admin', is_primary_admin = false } = body;

    if (!email || !full_name) {
      return NextResponse.json({ 
        error: 'Missing required fields',
        details: 'email and full_name are required'
      }, { status: 400 });
    }

    console.log(`[ADD_ADMIN] Adding admin to organization ${orgId}:`, { email, role, is_primary_admin });

    // Check if user already exists by email
    let userId: string;
    let isNewUser = false;

    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', email)
      .single();

    if (existingProfile) {
      // User exists, use existing ID
      userId = existingProfile.id;
      console.log('[ADD_ADMIN] User already exists:', userId);

      // Check if user already has a role in this organization
      const { data: existingRole } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .eq('organization_id', orgId)
        .single();

      if (existingRole) {
        return NextResponse.json({
          error: 'User already has a role in this organization',
          details: `User ${email} is already a ${existingRole.role} in this organization`
        }, { status: 400 });
      }
    } else {
      // Create new user
      if (!password) {
        return NextResponse.json({
          error: 'Password required for new user',
          details: 'Password is required when creating a new admin user'
        }, { status: 400 });
      }

      const { data: newUser, error: userError } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          full_name,
          organization_id: orgId
        }
      });

      if (userError) {
        throw new Error(`User creation failed: ${userError.message}`);
      }
      if (!newUser.user) {
        throw new Error('User creation returned null');
      }

      userId = newUser.user.id;
      isNewUser = true;
      console.log('[ADD_ADMIN] New user created:', userId);

      // Create profile for new user
      const { error: profileError } = await supabase
        .from('profiles')
        .insert({
          id: userId,
          email,
          full_name,
          role,
          organization_id: orgId
        });

      if (profileError) {
        // Rollback: Delete the auth user
        await adminClient.auth.admin.deleteUser(userId);
        throw new Error(`Profile creation failed: ${profileError.message}`);
      }
      console.log('[ADD_ADMIN] Profile created');
    }

    // If this should be primary admin and org doesn't have one yet
    const shouldBePrimary = is_primary_admin || !org.primary_admin_id;

    // Assign role
    const { error: roleAssignError } = await supabase
      .from('user_roles')
      .insert({
        user_id: userId,
        role,
        organization_id: orgId,
        is_primary_admin: shouldBePrimary,
        assigned_by: user.id
      });

    if (roleAssignError) {
      // Rollback: Delete user and profile if we created them
      if (isNewUser) {
        await adminClient.auth.admin.deleteUser(userId);
        await supabase.from('profiles').delete().eq('id', userId);
      }
      throw new Error(`Role assignment failed: ${roleAssignError.message}`);
    }
    console.log('[ADD_ADMIN] Role assigned');

    // If this is the primary admin, update organization
    if (shouldBePrimary) {
      const { error: orgUpdateError } = await supabase
        .from('organizations')
        .update({ primary_admin_id: userId })
        .eq('id', orgId);

      if (orgUpdateError) {
        console.warn('[ADD_ADMIN] Warning: Failed to update primary_admin_id:', orgUpdateError);
      } else {
        console.log('[ADD_ADMIN] Organization primary_admin_id updated');
      }
    }

    // Log audit event
    await supabase.from('audit_logs').insert({
      user_id: user.id,
      action: 'admin_added_to_organization',
      resource_type: 'organization',
      metadata: {
        organization_id: orgId,
        organization_name: org.name,
        admin_user_id: userId,
        admin_email: email,
        admin_role: role,
        is_primary_admin: shouldBePrimary,
        is_new_user: isNewUser
      }
    });

    return NextResponse.json({
      success: true,
      admin: {
        id: userId,
        email,
        full_name,
        role,
        is_primary_admin: shouldBePrimary
      }
    }, { status: 201 });

  } catch (error: unknown) {
    console.error('POST /api/v2/admin/super/organizations/[orgId]/admins/add error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to add admin' },
      { status: 500 }
    );
  }
}
