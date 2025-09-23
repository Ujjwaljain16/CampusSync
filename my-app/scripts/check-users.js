#!/usr/bin/env node

/**
 * Check users and their roles in the database
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

async function checkUsers() {
  console.log('🔍 Checking users and roles in database...\n');

  // Check environment variables
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    console.error('❌ Missing environment variables');
    process.exit(1);
  }

  // Create admin client
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  try {
    // Check auth users
    console.log('📋 Auth Users:');
    const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers();
    
    if (authError) {
      console.error('❌ Error fetching auth users:', authError.message);
    } else {
      console.log(`Found ${authUsers.users.length} users in auth.users:`);
      authUsers.users.forEach((user, index) => {
        console.log(`  ${index + 1}. ${user.email} (ID: ${user.id})`);
        console.log(`     Created: ${user.created_at}`);
        console.log(`     Last Sign In: ${user.last_sign_in_at || 'Never'}`);
        console.log('');
      });
    }

    // Check user roles
    console.log('📋 User Roles:');
    const { data: userRoles, error: rolesError } = await supabase
      .from('user_roles')
      .select('*')
      .order('created_at', { ascending: false });

    if (rolesError) {
      console.error('❌ Error fetching user roles:', rolesError.message);
    } else {
      console.log(`Found ${userRoles.length} user roles:`);
      userRoles.forEach((role, index) => {
        console.log(`  ${index + 1}. User ID: ${role.user_id}`);
        console.log(`     Role: ${role.role}`);
        console.log(`     Assigned by: ${role.assigned_by}`);
        console.log(`     Created: ${role.created_at}`);
        console.log('');
      });
    }

    // Check if admin email exists
    const adminEmail = 'jainujjwal1609@gmail.com';
    const adminUser = authUsers?.users?.find(u => u.email === adminEmail);
    
    if (adminUser) {
      console.log(`✅ Admin user found: ${adminEmail}`);
      console.log(`   User ID: ${adminUser.id}`);
      
      // Check if they have a role
      const adminRole = userRoles?.find(r => r.user_id === adminUser.id);
      if (adminRole) {
        console.log(`   Role: ${adminRole.role}`);
      } else {
        console.log('   ⚠️  No role assigned - this is the problem!');
        
        // Try to assign admin role
        console.log('🔧 Attempting to assign admin role...');
        const { error: insertError } = await supabase
          .from('user_roles')
          .insert({
            user_id: adminUser.id,
            role: 'admin',
            assigned_by: 'system',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });
        
        if (insertError) {
          console.error('❌ Error assigning admin role:', insertError.message);
        } else {
          console.log('✅ Admin role assigned successfully!');
        }
      }
    } else {
      console.log(`❌ Admin user not found: ${adminEmail}`);
      console.log('   Available emails:');
      authUsers?.users?.forEach(u => console.log(`     - ${u.email}`));
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

// Run the check
checkUsers().catch(console.error);
