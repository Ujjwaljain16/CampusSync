#!/usr/bin/env node

/**
 * Designate Super Admin Script
 * 
 * This script designates the first admin in the system as the super admin.
 * The super admin cannot be demoted and serves as the system's recovery mechanism.
 * 
 * Usage: node scripts/designate-super-admin.js [admin-email]
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

// Environment variables loaded from .env.local

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('ERROR: Missing required environment variables:');
  console.error('   NEXT_PUBLIC_SUPABASE_URL');
  console.error('   SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SERVICE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function designateSuperAdmin(adminEmail = null) {
  try {
    console.log('Checking for existing super admin...');
    
    // Check if super admin already exists
    const { data: existingSuperAdmin, error: checkError } = await supabase
      .from('user_roles')
      .select('user_id, is_super_admin')
      .eq('is_super_admin', true)
      .single();

    if (checkError && checkError.code !== 'PGRST116') {
      throw new Error(`Failed to check existing super admin: ${checkError.message}`);
    }

    if (existingSuperAdmin) {
      console.log('SUCCESS: Super admin already exists!');
      return;
    }

    console.log('Finding the first admin...');

    let targetUserId;

    if (adminEmail) {
      // Find admin by email
      const { data: authUser, error: authError } = await supabase.auth.admin.listUsers();
      if (authError) throw new Error(`Failed to fetch users: ${authError.message}`);

      const user = authUser.users.find(u => u.email === adminEmail);
      if (!user) {
        throw new Error(`User with email ${adminEmail} not found`);
      }

      // Check if user is an admin
      const { data: userRole, error: roleError } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .single();

      if (roleError) {
        throw new Error(`User ${adminEmail} does not have a role assigned`);
      }

      if (userRole.role !== 'admin') {
        throw new Error(`User ${adminEmail} is not an admin (current role: ${userRole.role})`);
      }

      targetUserId = user.id;
      console.log(`SUCCESS: Found admin: ${adminEmail}`);
    } else {
      // Find the first admin by creation date
      const { data: firstAdmin, error: adminError } = await supabase
        .from('user_roles')
        .select('user_id, created_at')
        .eq('role', 'admin')
        .order('created_at', { ascending: true })
        .limit(1)
        .single();

      if (adminError) {
        throw new Error(`Failed to find first admin: ${adminError.message}`);
      }

      targetUserId = firstAdmin.user_id;
      console.log(`SUCCESS: Found first admin (created: ${firstAdmin.created_at})`);
    }

    // Designate as super admin
    console.log('Designating super admin...');
    
    const { error: updateError } = await supabase
      .from('user_roles')
      .update({ is_super_admin: true })
      .eq('user_id', targetUserId);

    if (updateError) {
      throw new Error(`Failed to designate super admin: ${updateError.message}`);
    }

    // Get user email for confirmation
    const { data: authUser, error: userError } = await supabase.auth.admin.listUsers();
    if (userError) throw new Error(`Failed to fetch user details: ${userError.message}`);

    const user = authUser.users.find(u => u.id === targetUserId);
    const userEmail = user ? user.email : 'Unknown';

    console.log('SUCCESS: Super admin designated successfully!');
    console.log(`   User ID: ${targetUserId}`);
    console.log(`   Email: ${userEmail}`);
    console.log('   WARNING: This admin cannot be demoted and serves as system recovery');
    console.log('   WARNING: Keep this admin\'s credentials secure!');

  } catch (error) {
    console.error('ERROR:', error.message);
    process.exit(1);
  }
}

// Parse command line arguments
const adminEmail = process.argv[2];

console.log('Super Admin Designation Script');
console.log('=====================================');

if (adminEmail) {
  console.log(`Target admin email: ${adminEmail}`);
} else {
  console.log('No email specified, will designate the first admin by creation date');
}

designateSuperAdmin(adminEmail);
