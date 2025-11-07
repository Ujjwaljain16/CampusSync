import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabaseServer';

/**
 * GET /api/v2/admin/super/organizations/[orgId]/admins
 * Get all admins for a specific organization (super admin only)
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

    // Verify organization exists
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .select('id')
      .eq('id', orgId)
      .single();

    if (orgError || !org) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    }

    // Get all admins for this organization
    const { data: adminRoles, error: adminsError } = await supabase
      .from('user_roles')
      .select('user_id, role, is_primary_admin, created_at')
      .eq('organization_id', orgId)
      .in('role', ['org_admin', 'admin'])
      .order('is_primary_admin', { ascending: false })
      .order('created_at', { ascending: true });

    if (adminsError) {
      throw adminsError;
    }

    // Get profile data for each admin separately
    const formattedAdmins = await Promise.all(
      (adminRoles || []).map(async (adminRole) => {
        const { data: profile } = await supabase
          .from('profiles')
          .select('email, full_name')
          .eq('id', adminRole.user_id)
          .single();

        return {
          id: adminRole.user_id,
          email: profile?.email || '',
          full_name: profile?.full_name || '',
          role: adminRole.role,
          is_primary_admin: adminRole.is_primary_admin || false,
          created_at: adminRole.created_at
        };
      })
    );

    return NextResponse.json({ data: formattedAdmins });
  } catch (error: unknown) {
    console.error('GET /api/v2/admin/super/organizations/[orgId]/admins error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch admins' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/v2/admin/super/organizations/[orgId]/admins
 * Add a new admin to a specific organization (super admin only)
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
    const body = await request.json();
    const { email, full_name, password, role = 'org_admin', is_primary_admin = false } = body;

    // Validation
    if (!email || !full_name || !password) {
      return NextResponse.json(
        { error: 'Missing required fields: email, full_name, password' },
        { status: 400 }
      );
    }

    if (!['org_admin', 'admin'].includes(role)) {
      return NextResponse.json(
        { error: 'Invalid role. Must be org_admin or admin' },
        { status: 400 }
      );
    }

    // Verify organization exists
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .select('id, name')
      .eq('id', orgId)
      .single();

    if (orgError || !org) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    }

    // Check if user already exists
    const { data: existingUser } = await adminClient.auth.admin.listUsers();
    const userExists = existingUser?.users.find((u: { email?: string }) => u.email?.toLowerCase() === email.toLowerCase());

    let userId: string;

    if (userExists) {
      // User exists, update their profile for this organization
      userId = userExists.id;

      await adminClient
        .from('profiles')
        .update({
          full_name,
          role,
          organization_id: orgId
        })
        .eq('id', userId);
    } else {
      // Create new user
      const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          full_name,
          organization_id: orgId
        }
      });

      if (createError || !newUser.user) {
        return NextResponse.json(
          { error: createError?.message || 'Failed to create user' },
          { status: 500 }
        );
      }

      userId = newUser.user.id;

      // Create profile
      await adminClient
        .from('profiles')
        .upsert({
          id: userId,
          email,
          full_name,
          role,
          organization_id: orgId
        });
    }

    // Check if user already has a role in this org
    // (May have been auto-assigned 'student' role by database trigger)
    const { data: existingRoleCheck } = await adminClient
      .from('user_roles')
      .select('id, role')
      .eq('user_id', userId)
      .eq('organization_id', orgId)
      .maybeSingle();

    if (existingRoleCheck) {
      // If it's an auto-assigned student role, we can upgrade it to admin
      if (existingRoleCheck.role === 'student') {
        // Update the existing student role to admin role
        const { error: updateError } = await adminClient
          .from('user_roles')
          .update({
            role,
            is_primary_admin,
            assigned_by: user.id,
            updated_at: new Date().toISOString()
          })
          .eq('id', existingRoleCheck.id);

        if (updateError) {
          return NextResponse.json(
            { error: 'Failed to upgrade role: ' + updateError.message },
            { status: 500 }
          );
        }

        // If making primary admin, demote current primary admin (if any)
        if (is_primary_admin) {
          await adminClient
            .from('user_roles')
            .update({ is_primary_admin: false })
            .eq('organization_id', orgId)
            .eq('is_primary_admin', true)
            .neq('id', existingRoleCheck.id);
        }

        return NextResponse.json({
          success: true,
          data: {
            user_id: userId,
            email,
            full_name,
            role,
            is_primary_admin,
            upgraded_from: 'student'
          }
        }, { status: 201 });
      } else {
        // User already has a non-student role in this org
        return NextResponse.json(
          { error: `User already has role '${existingRoleCheck.role}' in this organization` },
          { status: 409 }
        );
      }
    }

    // If making primary admin, demote current primary admin
    if (is_primary_admin) {
      await adminClient
        .from('user_roles')
        .update({ is_primary_admin: false })
        .eq('organization_id', orgId)
        .eq('is_primary_admin', true);
    }

    // Create user role (no existing role found)
    const { error: roleInsertError } = await adminClient
      .from('user_roles')
      .insert({
        user_id: userId,
        organization_id: orgId,
        role,
        is_primary_admin,
        assigned_by: user.id
      });

    if (roleInsertError) {
      // Handle unique constraint violation
      if (roleInsertError.code === '23505') {
        return NextResponse.json(
          { error: 'User already has a role in this organization' },
          { status: 409 }
        );
      }
      return NextResponse.json(
        { error: 'Failed to assign role: ' + roleInsertError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        user_id: userId,
        email,
        full_name,
        role,
        is_primary_admin
      }
    }, { status: 201 });

  } catch (error: unknown) {
    console.error('POST /api/v2/admin/super/organizations/[orgId]/admins error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to add admin' },
      { status: 500 }
    );
  }
}
