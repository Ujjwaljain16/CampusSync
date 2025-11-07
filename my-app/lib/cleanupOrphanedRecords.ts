/**
 * Cleanup Orphaned Records
 * 
 * This module provides automated cleanup for orphaned database records
 * that may result from partial transaction failures during organization creation.
 * 
 * Orphaned records cleaned up:
 * 1. Organizations without any admins (older than 5 minutes)
 * 2. Org admin users whose organizations were deleted (older than 5 minutes)
 */

import { createSupabaseAdminClient } from './supabaseServer';

export async function cleanupOrphanedRecords() {
  const supabase = await createSupabaseAdminClient();
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

  console.log('[CLEANUP] 🧹 Starting orphaned records cleanup...');
  console.log(`[CLEANUP] Looking for records older than: ${fiveMinutesAgo}`);

  let totalOrgsDeleted = 0;
  let totalAdminsDeleted = 0;

  try {
    // ========================================
    // 1. Find organizations without any admins
    // ========================================
    console.log('[CLEANUP] Step 1: Checking for organizations without admins...');
    
    const { data: allOrgs, error: orgFetchError } = await supabase
      .from('organizations')
      .select('id, name, created_at')
      .lt('created_at', fiveMinutesAgo);

    if (orgFetchError) {
      console.error('[CLEANUP] ❌ Error fetching organizations:', orgFetchError);
      return { success: false, error: orgFetchError.message };
    }

    console.log(`[CLEANUP] Found ${allOrgs?.length || 0} organizations to check`);

    for (const org of allOrgs || []) {
      // Check if org has any admins
      const { data: admins, error: adminCheckError } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('organization_id', org.id)
        .eq('role', 'org_admin');

      if (adminCheckError) {
        console.error(`[CLEANUP] ❌ Error checking admins for org ${org.id}:`, adminCheckError);
        continue;
      }

      if (!admins || admins.length === 0) {
        // No admins found - this is an orphaned organization
        console.log(`[CLEANUP] 🔍 Found orphaned organization: "${org.name}" (${org.id})`);
        
        const { error: deleteError } = await supabase
          .from('organizations')
          .delete()
          .eq('id', org.id);

        if (deleteError) {
          console.error(`[CLEANUP] ❌ Failed to delete orphaned org ${org.id}:`, deleteError);
        } else {
          console.log(`[CLEANUP] ✅ Deleted orphaned organization: "${org.name}"`);
          totalOrgsDeleted++;
        }
      }
    }

    // ========================================
    // 2. Find org_admin users without organizations
    // ========================================
    console.log('[CLEANUP] Step 2: Checking for admin users without organizations...');
    
    const { data: allAdmins, error: adminFetchError } = await supabase
      .from('user_roles')
      .select('user_id, organization_id, created_at')
      .eq('role', 'org_admin')
      .lt('created_at', fiveMinutesAgo);

    if (adminFetchError) {
      console.error('[CLEANUP] ❌ Error fetching admin roles:', adminFetchError);
      return { success: false, error: adminFetchError.message };
    }

    console.log(`[CLEANUP] Found ${allAdmins?.length || 0} admin roles to check`);

    for (const admin of allAdmins || []) {
      // Check if organization still exists
      const { data: orgExists, error: orgCheckError } = await supabase
        .from('organizations')
        .select('id')
        .eq('id', admin.organization_id)
        .maybeSingle();

      if (orgCheckError && orgCheckError.code !== 'PGRST116') {
        console.error(`[CLEANUP] ❌ Error checking org existence for ${admin.organization_id}:`, orgCheckError);
        continue;
      }

      if (!orgExists) {
        // Organization doesn't exist - clean up orphaned admin
        console.log(`[CLEANUP] 🔍 Found orphaned admin user: ${admin.user_id}`);
        
        // Delete from user_roles
        const { error: roleDeleteError } = await supabase
          .from('user_roles')
          .delete()
          .eq('user_id', admin.user_id);

        if (roleDeleteError) {
          console.error(`[CLEANUP] ❌ Failed to delete user role for ${admin.user_id}:`, roleDeleteError);
        } else {
          console.log(`[CLEANUP] ✅ Deleted user_roles for: ${admin.user_id}`);
        }

        // Delete from profiles
        const { error: profileDeleteError } = await supabase
          .from('profiles')
          .delete()
          .eq('id', admin.user_id);

        if (profileDeleteError) {
          console.error(`[CLEANUP] ❌ Failed to delete profile for ${admin.user_id}:`, profileDeleteError);
        } else {
          console.log(`[CLEANUP] ✅ Deleted profile for: ${admin.user_id}`);
        }

        // Delete from auth (most important - remove actual user account)
        const { error: userDeleteError } = await supabase.auth.admin.deleteUser(admin.user_id);

        if (userDeleteError) {
          console.error(`[CLEANUP] ❌ Failed to delete auth user ${admin.user_id}:`, userDeleteError);
        } else {
          console.log(`[CLEANUP] ✅ Deleted auth user: ${admin.user_id}`);
          totalAdminsDeleted++;
        }
      }
    }

    // ========================================
    // Summary
    // ========================================
    console.log('\n[CLEANUP] 📊 Cleanup Summary:');
    console.log(`[CLEANUP]   - Organizations deleted: ${totalOrgsDeleted}`);
    console.log(`[CLEANUP]   - Admin users deleted: ${totalAdminsDeleted}`);
    console.log('[CLEANUP] ✅ Cleanup complete\n');

    return {
      success: true,
      stats: {
        organizations_deleted: totalOrgsDeleted,
        admins_deleted: totalAdminsDeleted
      }
    };

  } catch (error) {
    console.error('[CLEANUP] ❌ Cleanup job failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Run cleanup when executed directly (for manual runs or cron jobs)
 */
if (require.main === module) {
  console.log('[CLEANUP] 🚀 Starting manual cleanup job...\n');
  
  cleanupOrphanedRecords()
    .then((result) => {
      if (result.success) {
        console.log('[CLEANUP] ✅ Manual cleanup job finished successfully');
        process.exit(0);
      } else {
        console.error('[CLEANUP] ❌ Manual cleanup job failed:', result.error);
        process.exit(1);
      }
    })
    .catch((error) => {
      console.error('[CLEANUP] ❌ Manual cleanup job crashed:', error);
      process.exit(1);
    });
}
