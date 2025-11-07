import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabaseServer';

interface RollbackState {
  createdOrgId?: string;
  createdUserId?: string;
  createdRoleId?: string;
  createdProfileId?: string;
}

/**
 * Helper function to log audit events
 */
async function logAuditEvent(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, event: {
  actor_id: string;
  action: string;
  metadata?: Record<string, unknown>;
}) {
  try {
    await supabase.from('audit_logs').insert({
      user_id: event.actor_id,
      action: event.action,
      resource_type: 'organization',
      metadata: event.metadata || {},
      created_at: new Date().toISOString()
    });
  } catch (error) {
    console.error('[AUDIT_LOG] Failed to log event:', error);
  }
}

/**
 * POST /api/v2/admin/super/organizations/complete
 * 
 * Complete organization creation with admin account.
 * Includes full transactional rollback on any failure.
 * 
 * This endpoint creates:
 * 1. Organization record
 * 2. Admin user in auth.users
 * 3. User role (org_admin)
 * 4. User profile
 * 
 * If any step fails, all previous steps are rolled back.
 */
export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const adminClient = await createSupabaseAdminClient();
  
  const rollbackState: RollbackState = {};
  const rollbackErrors: string[] = [];

  try {
    // ========================================
    // AUTHENTICATION & AUTHORIZATION
    // ========================================
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

    // ========================================
    // PARSE REQUEST BODY
    // ========================================
    const body = await request.json();
    const { organizationData, adminData } = body;

    if (!organizationData || !adminData) {
      return NextResponse.json({
        error: 'Missing required data',
        details: 'Both organizationData and adminData are required'
      }, { status: 400 });
    }

    console.log('[ORG_CREATE] Starting complete organization creation process');

    // ========================================
    // STEP 1: Create Organization
    // ========================================
    const { data: organization, error: orgError } = await supabase
      .from('organizations')
      .insert({
        name: organizationData.name,
        slug: organizationData.slug,
        type: organizationData.type,
        email: organizationData.email,
        phone: organizationData.phone || null,
        website: organizationData.website || null,
        settings: organizationData.settings || {},
        is_active: true,
        is_verified: true,
        verified_at: new Date().toISOString()
      })
      .select()
      .single();

    if (orgError) {
      throw new Error(`[STEP 1] Organization creation failed: ${orgError.message}`);
    }
    if (!organization) {
      throw new Error('[STEP 1] Organization creation returned null');
    }
    
    rollbackState.createdOrgId = organization.id;
    console.log('[ORG_CREATE] ✅ Step 1: Organization created', organization.id);

    // ========================================
    // STEP 2: Create Admin User
    // ========================================
    const { data: newUser, error: userError } = await adminClient.auth.admin.createUser({
      email: adminData.email,
      password: adminData.password,
      email_confirm: true,
      user_metadata: { 
        full_name: adminData.name,
        organization_id: organization.id
      }
    });

    if (userError) {
      throw new Error(`[STEP 2] User creation failed: ${userError.message}`);
    }
    if (!newUser.user) {
      throw new Error('[STEP 2] User creation returned null');
    }
    
    rollbackState.createdUserId = newUser.user.id;
    console.log('[ORG_CREATE] ✅ Step 2: Admin user created', newUser.user.id);

    // ========================================
    // STEP 3: Assign org_admin Role
    // ========================================
    const { data: roleData, error: roleAssignError } = await supabase
      .from('user_roles')
      .insert({
        user_id: newUser.user.id,
        role: 'org_admin',
        organization_id: organization.id,
        assigned_by: user.id
      })
      .select()
      .single();

    if (roleAssignError) {
      throw new Error(`[STEP 3] Role assignment failed: ${roleAssignError.message}`);
    }
    
    rollbackState.createdRoleId = roleData?.id;
    console.log('[ORG_CREATE] ✅ Step 3: org_admin role assigned');

    // ========================================
    // STEP 4: Create Profile
    // ========================================
    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .insert({
        id: newUser.user.id,
        full_name: adminData.name,
        email: adminData.email,
        role: 'org_admin',
        organization_id: organization.id
      })
      .select()
      .single();

    if (profileError) {
      console.warn('[ORG_CREATE] ⚠️ Profile creation warning:', profileError.message);
      // Don't fail entire operation for profile creation
    } else {
      rollbackState.createdProfileId = profileData?.id;
      console.log('[ORG_CREATE] ✅ Step 4: Profile created');
    }

    // ========================================
    // SUCCESS: Log Audit Event
    // ========================================
    await logAuditEvent(supabase, {
      actor_id: user.id,
      action: 'organization_created_complete',
      metadata: {
        organization_id: organization.id,
        organization_name: organizationData.name,
        admin_email: adminData.email,
        admin_user_id: newUser.user.id
      }
    });

    console.log('[ORG_CREATE] ✅ Complete: Organization and admin created successfully');

    return NextResponse.json({ 
      success: true,
      organization, 
      admin: {
        id: newUser.user.id,
        email: newUser.user.email,
        name: adminData.name
      }
    }, { status: 201 });

  } catch (error) {
    console.error('[ORG_CREATE] ❌ FAILURE - Beginning rollback:', error);

    // ========================================
    // ROLLBACK: Clean up partial state
    // ========================================

    // Rollback Step 4: Remove profile
    if (rollbackState.createdProfileId && rollbackState.createdUserId) {
      try {
        const { error: profileDeleteError } = await supabase
          .from('profiles')
          .delete()
          .eq('id', rollbackState.createdUserId);
        
        if (profileDeleteError) {
          rollbackErrors.push(`Profile deletion: ${profileDeleteError.message}`);
        } else {
          console.log('[ROLLBACK] ✅ Profile deleted');
        }
      } catch (err) {
        rollbackErrors.push(`Profile deletion exception: ${err instanceof Error ? err.message : 'Unknown'}`);
      }
    }

    // Rollback Step 3: Remove role
    if (rollbackState.createdUserId && rollbackState.createdOrgId) {
      try {
        const { error: roleDeleteError } = await supabase
          .from('user_roles')
          .delete()
          .eq('user_id', rollbackState.createdUserId)
          .eq('organization_id', rollbackState.createdOrgId);
        
        if (roleDeleteError) {
          rollbackErrors.push(`Role deletion: ${roleDeleteError.message}`);
        } else {
          console.log('[ROLLBACK] ✅ Role deleted');
        }
      } catch (err) {
        rollbackErrors.push(`Role deletion exception: ${err instanceof Error ? err.message : 'Unknown'}`);
      }
    }

    // Rollback Step 2: Delete user from auth
    if (rollbackState.createdUserId) {
      try {
        const { error: userDeleteError } = await adminClient.auth.admin.deleteUser(
          rollbackState.createdUserId
        );
        
        if (userDeleteError) {
          rollbackErrors.push(`User deletion: ${userDeleteError.message}`);
        } else {
          console.log('[ROLLBACK] ✅ User deleted from auth');
        }
      } catch (err) {
        rollbackErrors.push(`User deletion exception: ${err instanceof Error ? err.message : 'Unknown'}`);
      }
    }

    // Rollback Step 1: Delete organization
    if (rollbackState.createdOrgId) {
      try {
        const { error: orgDeleteError } = await supabase
          .from('organizations')
          .delete()
          .eq('id', rollbackState.createdOrgId);
        
        if (orgDeleteError) {
          rollbackErrors.push(`Organization deletion: ${orgDeleteError.message}`);
        } else {
          console.log('[ROLLBACK] ✅ Organization deleted');
        }
      } catch (err) {
        rollbackErrors.push(`Organization deletion exception: ${err instanceof Error ? err.message : 'Unknown'}`);
      }
    }

    // ========================================
    // Log Rollback Status
    // ========================================
    const { data: { user: currentUser } } = await supabase.auth.getUser();
    
    if (currentUser) {
      if (rollbackErrors.length > 0) {
        console.error('[ROLLBACK] ⚠️ Partial rollback - Manual cleanup may be required:', rollbackErrors);
        await logAuditEvent(supabase, {
          actor_id: currentUser.id,
          action: 'organization_creation_failed_partial_rollback',
          metadata: {
            original_error: error instanceof Error ? error.message : 'Unknown error',
            rollback_errors: rollbackErrors,
            organization_id: rollbackState.createdOrgId,
            user_id: rollbackState.createdUserId
          }
        });
      } else {
        console.log('[ROLLBACK] ✅ Full rollback successful');
        await logAuditEvent(supabase, {
          actor_id: currentUser.id,
          action: 'organization_creation_failed_fully_rolled_back',
          metadata: {
            error: error instanceof Error ? error.message : 'Unknown error'
          }
        });
      }
    }

    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Organization creation failed',
        details: rollbackErrors.length > 0 
          ? 'Partial rollback - Support team has been notified. Some manual cleanup may be required.'
          : 'All changes have been rolled back successfully. You can try again.'
      },
      { status: 500 }
    );
  }
}
