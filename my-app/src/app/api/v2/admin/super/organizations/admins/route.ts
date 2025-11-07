import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient, createSupabaseServerClient } from '@/lib/supabaseServer';

/**
 * POST /api/v2/admin/super/organizations/admins
 * Create an org admin for an organization (super admin only)
 */
export async function POST(request: NextRequest) {
  const requestId = Math.random().toString(36).substring(7);
  console.log(`[ADD_ADMIN:${requestId}] 🚀 Starting admin creation request`);
  
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

    const body = await request.json();
    const { organizationId, email, name, password } = body;

    console.log(`[ADD_ADMIN:${requestId}] Request data:`, { organizationId, email, name });

    // Validate required fields
    if (!organizationId || !email || !name || !password) {
      console.log(`[ADD_ADMIN:${requestId}] ❌ Missing required fields`);
      return NextResponse.json(
        { error: 'Missing required fields: organizationId, email, name, password' },
        { status: 400 }
      );
    }

    // Verify organization exists
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .select('id')
      .eq('id', organizationId)
      .single();

    if (orgError || !org) {
      return NextResponse.json(
        { error: 'Organization not found' },
        { status: 404 }
      );
    }

    // Use admin client to create user
    const adminClient = await createSupabaseAdminClient();

    // Check if user already exists by looking up profile first (more reliable)
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    let userId: string;
    let isNewUser = false;

    if (existingProfile) {
      // User exists - check if they already have a role in this organization
      userId = existingProfile.id;
      
      console.log(`[ADD_ADMIN:${requestId}] 📋 Found existing profile: ${userId}`);
      
      const { data: existingRole } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .eq('organization_id', organizationId)
        .maybeSingle();

      if (existingRole) {
        console.log(`[ADD_ADMIN:${requestId}] ⚠️ User already has role: ${existingRole.role}`);
        return NextResponse.json(
          { 
            error: 'User already has a role in this organization',
            message: `${email} is already a ${existingRole.role} in this organization`
          },
          { status: 409 }
        );
      }

      console.log(`[ADD_ADMIN:${requestId}] ✅ Using existing user from profile: ${userId} (${email})`);
    } else {
      // Check auth.users as well (in case profile is missing)
      const { data: existingUserData } = await adminClient.auth.admin.listUsers();
      const existingAuthUser = existingUserData?.users?.find((u: { email?: string }) => u.email === email);

      if (existingAuthUser) {
        userId = existingAuthUser.id;
        
        // Check for existing role
        const { data: existingRole } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', userId)
          .eq('organization_id', organizationId)
          .maybeSingle();

        if (existingRole) {
          return NextResponse.json(
            { 
              error: 'User already has a role in this organization',
              message: `${email} is already a ${existingRole.role} in this organization`
            },
            { status: 409 }
          );
        }

        console.log(`[ADD_ADMIN] Using existing user from auth: ${userId} (${email})`);
      } else {
        // Create new user
        const { data: newUser, error: createUserError } = await adminClient.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: {
            full_name: name
          }
        });

        if (createUserError) {
          throw new Error(`Failed to create user: ${createUserError.message}`);
        }

        if (!newUser.user) {
          throw new Error('User creation failed');
        }

        userId = newUser.user.id;
        isNewUser = true;
        console.log(`[ADD_ADMIN:${requestId}] ✅ Created new user: ${userId} (${email})`);
      }
    }

    // Check if role already exists (could be from assign_default_role trigger)
    console.log(`[ADD_ADMIN:${requestId}] 🔍 Checking for existing role...`);
    const { data: existingRoleCheck } = await supabase
      .from('user_roles')
      .select('id, role')
      .eq('user_id', userId)
      .eq('organization_id', organizationId)
      .maybeSingle();

    if (existingRoleCheck) {
      console.log(`[ADD_ADMIN:${requestId}] ⚠️ Role already exists (${existingRoleCheck.role}), updating to org_admin`);
      
      // Update existing role to org_admin
      const { error: updateError } = await supabase
        .from('user_roles')
        .update({
          role: 'org_admin',
          assigned_by: user.id,
          updated_at: new Date().toISOString()
        })
        .eq('id', existingRoleCheck.id);

      if (updateError) {
        console.error(`[ADD_ADMIN:${requestId}] ❌ Failed to update role:`, updateError);
        if (isNewUser) {
          console.log(`[ADD_ADMIN:${requestId}] 🔄 Rolling back: Deleting created user ${userId}`);
          await adminClient.auth.admin.deleteUser(userId);
        }
        throw new Error(`Failed to update role: ${updateError.message}`);
      }

      console.log(`[ADD_ADMIN:${requestId}] ✅ Role updated successfully`);
    } else {
      console.log(`[ADD_ADMIN:${requestId}] ✅ No existing role found, inserting new role`);

      // Create user role as org_admin
      const { error: roleError2 } = await supabase
        .from('user_roles')
        .insert({
          user_id: userId,
          role: 'org_admin',
          organization_id: organizationId,
          assigned_by: user.id,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });

      if (roleError2) {
        console.error(`[ADD_ADMIN:${requestId}] ❌ Role assignment failed:`, roleError2);
        // Rollback: delete the created user only if we just created them
        if (isNewUser) {
          console.log(`[ADD_ADMIN:${requestId}] 🔄 Rolling back: Deleting created user ${userId}`);
          await adminClient.auth.admin.deleteUser(userId);
        }
        throw new Error(`Failed to assign role: ${roleError2.message}`);
      }

      console.log(`[ADD_ADMIN:${requestId}] ✅ Role assigned successfully`);
    }

    // Create or update profile (profiles table doesn't have 'org_admin' in check constraint, use 'admin')
    const { error: profileError } = await supabase
      .from('profiles')
      .upsert({
        id: userId,
        full_name: name,
        email: email,
        role: 'admin', // Use 'admin' instead of 'org_admin' due to profiles.role check constraint
        organization_id: organizationId
      }, {
        onConflict: 'id'
      });

    if (profileError) {
      console.error(`[ADD_ADMIN:${requestId}] Failed to create/update profile:`, profileError);
      // Don't rollback for profile creation failure
    } else {
      console.log(`[ADD_ADMIN:${requestId}] ✅ Profile created/updated successfully`);
    }

    console.log(`[ADD_ADMIN:${requestId}] 🎉 Successfully added org_admin role for ${email} in organization ${organizationId}`);

    return NextResponse.json({
      admin: {
        id: userId,
        email: email,
        name: name
      }
    }, { status: 201 });
  } catch (error: unknown) {
    console.error(`[ADD_ADMIN:${requestId}] ❌ ERROR:`, error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create admin' },
      { status: 500 }
    );
  }
}
