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
import { logger } from './logger';

export async function cleanupOrphanedRecords() {
  const supabase = await createSupabaseAdminClient();
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

  logger.debug('[CLEANUP] Starting orphaned records cleanup', { threshold: fiveMinutesAgo });

  let totalOrgsDeleted = 0;
  let totalAdminsDeleted = 0;

  try {
    // ========================================
    // 1. Find organizations without any admins
    // ========================================
    logger.debug('[CLEANUP] Step 1: Checking for organizations without admins');
    
    const { data: allOrgs, error: orgFetchError } = await supabase
      .from('organizations')
      .select('id, name, created_at')
      .lt('created_at', fiveMinutesAgo);

    if (orgFetchError) {
      logger.error('[CLEANUP] Error fetching organizations', orgFetchError);
      return { success: false, error: orgFetchError.message };
    }

    logger.debug(`[CLEANUP] Found organizations to check`, { count: allOrgs?.length || 0 });

    for (const org of allOrgs || []) {
      // Check if org has any admins
      const { data: admins, error: adminCheckError } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('organization_id', org.id)
        .eq('role', 'org_admin');

      if (adminCheckError) {
        logger.error(`[CLEANUP] Error checking admins for org`, { orgId: org.id, error: adminCheckError });
        continue;
      }

      if (!admins || admins.length === 0) {
        // No admins found - this is an orphaned organization
        logger.debug(`[CLEANUP] Found orphaned organization`, { name: org.name, id: org.id });
        
        const { error: deleteError } = await supabase
          .from('organizations')
          .delete()
          .eq('id', org.id);

        if (deleteError) {
          logger.error(`[CLEANUP] Failed to delete orphaned org`, { orgId: org.id, error: deleteError });
        } else {
          logger.debug(`[CLEANUP] Deleted orphaned organization`, { name: org.name });
          totalOrgsDeleted++;
        }
      }
    }

    // ========================================
    // 2. Find org_admin users without organizations
    // ========================================
    logger.debug('[CLEANUP] Step 2: Checking for admin users without organizations');
    
    const { data: allAdmins, error: adminFetchError } = await supabase
      .from('user_roles')
      .select('user_id, organization_id, created_at')
      .eq('role', 'org_admin')
      .lt('created_at', fiveMinutesAgo);

    if (adminFetchError) {
      logger.error('[CLEANUP] Error fetching admin roles', adminFetchError);
      return { success: false, error: adminFetchError.message };
    }

    logger.debug('[CLEANUP] Found admin roles to check', { count: allAdmins?.length || 0 });

    for (const admin of allAdmins || []) {
      // Check if organization still exists
      const { data: orgExists, error: orgCheckError } = await supabase
        .from('organizations')
        .select('id')
        .eq('id', admin.organization_id)
        .maybeSingle();

      if (orgCheckError && orgCheckError.code !== 'PGRST116') {
        logger.error('[CLEANUP] Error checking org existence', { orgId: admin.organization_id, error: orgCheckError });
        continue;
      }

      if (!orgExists) {
        // Organization doesn't exist - clean up orphaned admin
        logger.debug('[CLEANUP] Found orphaned admin user', { userId: admin.user_id });
        
        // Delete from user_roles
        const { error: roleDeleteError } = await supabase
          .from('user_roles')
          .delete()
          .eq('user_id', admin.user_id);

        if (roleDeleteError) {
          logger.error('[CLEANUP] Failed to delete user role', { userId: admin.user_id, error: roleDeleteError });
        } else {
          logger.debug('[CLEANUP] Deleted user_roles', { userId: admin.user_id });
        }

        // Delete from profiles
        const { error: profileDeleteError } = await supabase
          .from('profiles')
          .delete()
          .eq('id', admin.user_id);

        if (profileDeleteError) {
          logger.error('[CLEANUP] Failed to delete profile', { userId: admin.user_id, error: profileDeleteError });
        } else {
          logger.debug('[CLEANUP] Deleted profile', { userId: admin.user_id });
        }

        // Delete from auth (most important - remove actual user account)
        const { error: userDeleteError } = await supabase.auth.admin.deleteUser(admin.user_id);

        if (userDeleteError) {
          logger.error('[CLEANUP] Failed to delete auth user', { userId: admin.user_id, error: userDeleteError });
        } else {
          logger.debug('[CLEANUP] Deleted auth user', { userId: admin.user_id });
          totalAdminsDeleted++;
        }
      }
    }

    // ========================================
    // Summary
    // ========================================
    logger.debug('[CLEANUP] Cleanup Summary', {
      organizationsDeleted: totalOrgsDeleted,
      adminsDeleted: totalAdminsDeleted
    });

    return {
      success: true,
      stats: {
        organizations_deleted: totalOrgsDeleted,
        admins_deleted: totalAdminsDeleted
      }
    };

  } catch (error) {
    logger.error('[CLEANUP] Cleanup job failed', error);
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
  logger.debug('[CLEANUP] Starting manual cleanup job');
  
  cleanupOrphanedRecords()
    .then((result) => {
      if (result.success) {
        logger.success('[CLEANUP] Manual cleanup job finished successfully');
        process.exit(0);
      } else {
        logger.error('[CLEANUP] Manual cleanup job failed', result.error);
        process.exit(1);
      }
    })
    .catch((error) => {
      logger.error('[CLEANUP] Manual cleanup job crashed', error);
      process.exit(1);
    });
}
