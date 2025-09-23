#!/usr/bin/env node

/**
 * Emergency Admin Access Restoration Script
 * Use this if you accidentally removed your own admin role
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase environment variables');
  console.error('Make sure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function restoreAdminAccess() {
  try {
    console.log('🔍 Finding your user account...');
    
    // Get the most recent user (likely you)
    const { data: users, error: usersError } = await supabase
      .from('auth.users')
      .select('id, email, created_at')
      .order('created_at', { ascending: false })
      .limit(5);

    if (usersError) {
      console.error('❌ Error fetching users:', usersError.message);
      return;
    }

    if (!users || users.length === 0) {
      console.error('❌ No users found');
      return;
    }

    console.log('\n📋 Recent users:');
    users.forEach((user, index) => {
      console.log(`${index + 1}. ${user.email} (ID: ${user.id})`);
    });

    // Use the first user (most recent)
    const targetUser = users[0];
    console.log(`\n🎯 Restoring admin access for: ${targetUser.email}`);

    // Check current role
    const { data: currentRole } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', targetUser.id)
      .single();

    if (currentRole) {
      console.log(`Current role: ${currentRole.role}`);
    } else {
      console.log('No role found - user will be assigned admin role');
    }

    // Restore admin role
    const { error: roleError } = await supabase
      .from('user_roles')
      .upsert({
        user_id: targetUser.id,
        role: 'admin',
        assigned_by: targetUser.id, // Self-assigned for recovery
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });

    if (roleError) {
      console.error('❌ Error restoring admin role:', roleError.message);
      return;
    }

    console.log('✅ Admin access restored successfully!');
    console.log('You can now log in and access the admin dashboard.');

  } catch (error) {
    console.error('❌ Unexpected error:', error.message);
  }
}

// Alternative method using direct SQL
async function restoreAdminAccessSQL() {
  console.log('\n🔧 Alternative: Run this SQL in Supabase SQL Editor:');
  console.log(`
-- Find your user ID first
SELECT id, email, created_at 
FROM auth.users 
ORDER BY created_at DESC 
LIMIT 5;

-- Replace 'YOUR_USER_ID_HERE' with your actual user ID
INSERT INTO user_roles (user_id, role, assigned_by, created_at, updated_at)
VALUES (
  'YOUR_USER_ID_HERE', 
  'admin', 
  'YOUR_USER_ID_HERE', 
  NOW(), 
  NOW()
)
ON CONFLICT (user_id) 
DO UPDATE SET 
  role = 'admin',
  assigned_by = 'YOUR_USER_ID_HERE',
  updated_at = NOW();
  `);
}

async function main() {
  console.log('🚨 Emergency Admin Access Restoration');
  console.log('=====================================\n');

  // Try the programmatic approach first
  await restoreAdminAccess();
  
  // Also show the SQL approach
  await restoreAdminAccessSQL();
}

main().catch(console.error);
