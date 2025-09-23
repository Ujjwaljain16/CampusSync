#!/usr/bin/env node

/**
 * Create First Admin Script
 * 
 * This script creates the first admin user for CampusSync.
 * It should be run once during initial setup.
 * 
 * Usage: node scripts/create-first-admin.js
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing required environment variables:');
  console.error('   NEXT_PUBLIC_SUPABASE_URL');
  console.error('   SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function createFirstAdmin() {
  console.log('🚀 Creating first admin user for CampusSync...\n');

  try {
    // Get admin details from user input
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const question = (prompt) => new Promise((resolve) => rl.question(prompt, resolve));

    console.log('Please provide admin details:');
    const email = await question('📧 Admin Email: ');
    const password = await question('🔒 Admin Password: ');
    const fullName = await question('👤 Full Name: ');

    if (!email || !password || !fullName) {
      console.error('❌ All fields are required!');
      rl.close();
      process.exit(1);
    }

    rl.close();

    console.log('\n🔄 Creating admin user...');

    // Create user in Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: email.trim().toLowerCase(),
      password: password,
      email_confirm: true, // Auto-confirm email
      user_metadata: {
        full_name: fullName,
        role: 'admin'
      }
    });

    if (authError) {
      console.error('❌ Failed to create auth user:', authError.message);
      process.exit(1);
    }

    console.log('✅ Auth user created successfully');

    // Assign admin role in user_roles table
    const { error: roleError } = await supabase
      .from('user_roles')
      .insert({
        user_id: authData.user.id,
        role: 'admin',
        assigned_by: authData.user.id, // Self-assigned for first admin
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });

    if (roleError) {
      console.error('❌ Failed to assign admin role:', roleError.message);
      process.exit(1);
    }

    console.log('✅ Admin role assigned successfully');

    // Add admin email to allowed domains if it's educational
    const domain = email.split('@')[1];
    if (domain && !domain.includes('gmail.com') && !domain.includes('yahoo.com')) {
      const { error: domainError } = await supabase
        .from('allowed_domains')
        .insert({
          domain: domain,
          description: `Admin domain for ${fullName}`,
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });

      if (domainError) {
        console.log('⚠️  Could not add admin domain to allowed domains:', domainError.message);
      } else {
        console.log('✅ Admin domain added to allowed domains');
      }
    }

    console.log('\n🎉 First admin user created successfully!');
    console.log('📧 Email:', email);
    console.log('👤 Name:', fullName);
    console.log('🔑 Role: admin');
    console.log('\n🚀 You can now:');
    console.log('   1. Login to the admin dashboard');
    console.log('   2. Create additional admin users');
    console.log('   3. Manage user roles');
    console.log('   4. Configure system settings');

  } catch (error) {
    console.error('❌ Unexpected error:', error.message);
    process.exit(1);
  }
}

// Run the script
createFirstAdmin();
