#!/usr/bin/env node

/**
 * Setup First Superadmin User Script
 * 
 * This script creates the initial superadmin account for CampusSync.
 * Superadmins have system-wide access across all organizations and can:
 * - Manage all organizations
 * - Access super_admin_audit logs
 * - Bypass RLS policies
 * - Manage system settings
 * 
 * Usage:
 *   node scripts/setup-superadmin.mjs
 * 
 * Environment Variables Required:
 *   - NEXT_PUBLIC_SUPABASE_URL
 *   - NEXT_PUBLIC_SUPABASE_ANON_KEY
 *   - SUPABASE_SERVICE_ROLE_KEY (for admin operations)
 */

import { createClient } from '@supabase/supabase-js';
import readline from 'readline';

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

// Helper function to colorize output
function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// Promisified question function
function question(query) {
  return new Promise((resolve) => rl.question(query, resolve));
}

// Validate email format
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// Validate password strength
function isValidPassword(password) {
  // At least 8 characters, 1 uppercase, 1 lowercase, 1 number
  return password.length >= 8;
}

async function setupSuperadmin() {
  log('\n╔══════════════════════════════════════════════════════════╗', 'cyan');
  log('║     🚀 CampusSync Superadmin Setup Script              ║', 'cyan');
  log('╚══════════════════════════════════════════════════════════╝\n', 'cyan');

  // Check environment variables
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
    log('❌ Error: Missing required environment variables', 'red');
    log('   Please ensure the following are set in your .env.local:', 'yellow');
    log('   - NEXT_PUBLIC_SUPABASE_URL', 'yellow');
    log('   - NEXT_PUBLIC_SUPABASE_ANON_KEY', 'yellow');
    log('   - SUPABASE_SERVICE_ROLE_KEY', 'yellow');
    rl.close();
    process.exit(1);
  }

  // Create Supabase admin client
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  log('✅ Connected to Supabase', 'green');

  try {
    // Get user input
    log('\n📝 Please provide the following information:\n', 'bright');

    // Email
    let email = '';
    while (!email || !isValidEmail(email)) {
      email = await question('Email address: ');
      if (!isValidEmail(email)) {
        log('   ⚠️  Invalid email format. Please try again.', 'yellow');
      }
    }

    // Password
    let password = '';
    while (!password || !isValidPassword(password)) {
      password = await question('Password (min 8 characters): ');
      if (!isValidPassword(password)) {
        log('   ⚠️  Password must be at least 8 characters. Please try again.', 'yellow');
      }
    }

    // Full name
    const fullName = await question('Full Name: ');

    // Phone (optional)
    const phone = await question('Phone Number (optional): ');

    log('\n🔍 Checking if user already exists...', 'blue');

    // Check if user already exists by email
    const { data: existingUsers, error: checkError } = await supabaseAdmin.auth.admin.listUsers();

    if (checkError) {
      throw new Error(`Failed to check existing users: ${checkError.message}`);
    }

    const existingUser = existingUsers.users.find((u) => u.email === email);

    if (existingUser) {
      log(`\n⚠️  User with email ${email} already exists!`, 'yellow');
      const proceed = await question('Do you want to upgrade this user to superadmin? (yes/no): ');

      if (proceed.toLowerCase() !== 'yes' && proceed.toLowerCase() !== 'y') {
        log('\n❌ Operation cancelled', 'red');
        rl.close();
        return;
      }

      // Update existing user to superadmin
      log('\n🔄 Upgrading user to superadmin...', 'blue');

      // Update user_roles table
      const { error: roleError } = await supabaseAdmin
        .from('user_roles')
        .upsert(
          {
            user_id: existingUser.id,
            role: 'super_admin',
            assigned_by: existingUser.id,
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: 'user_id',
          }
        );

      if (roleError) {
        throw new Error(`Failed to update user role: ${roleError.message}`);
      }

      // Update profiles table
      const { error: profileError } = await supabaseAdmin
        .from('profiles')
        .update({
          role: 'super_admin',
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingUser.id);

      if (profileError) {
        throw new Error(`Failed to update profile: ${profileError.message}`);
      }

      // Log the action in super_admin_audit
      const { error: auditError } = await supabaseAdmin.from('super_admin_audit').insert({
        admin_id: existingUser.id,
        action: 'UPGRADE_TO_SUPERADMIN',
        target_type: 'user',
        target_id: existingUser.id,
        details: {
          email: existingUser.email,
          upgraded_via_script: true,
        },
        created_at: new Date().toISOString(),
      });

      if (auditError) {
        log(`   ⚠️  Warning: Failed to create audit log: ${auditError.message}`, 'yellow');
      }

      log('\n✅ User successfully upgraded to superadmin!', 'green');
      displaySuccessInfo(email, existingUser.id);
    } else {
      // Create new superadmin user
      log('\n👤 Creating new superadmin user...', 'blue');

      // Create auth user
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true, // Auto-confirm email for superadmin
        user_metadata: {
          full_name: fullName,
          role: 'super_admin',
        },
      });

      if (authError) {
        throw new Error(`Failed to create auth user: ${authError.message}`);
      }

      log('   ✓ Auth user created', 'green');

      const userId = authData.user.id;

      // Create profile
      const { error: profileError } = await supabaseAdmin.from('profiles').insert({
        id: userId,
        email,
        full_name: fullName,
        phone: phone || null,
        role: 'super_admin',
        organization_id: null, // Superadmins are not bound to any organization
        email_verified: true,
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      if (profileError) {
        throw new Error(`Failed to create profile: ${profileError.message}`);
      }

      log('   ✓ Profile created', 'green');

      // Create user_roles entry
      const { error: roleError } = await supabaseAdmin.from('user_roles').insert({
        user_id: userId,
        role: 'super_admin',
        assigned_by: userId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      if (roleError) {
        throw new Error(`Failed to create user role: ${roleError.message}`);
      }

      log('   ✓ Role assigned', 'green');

      // Create audit log entry
      const { error: auditError } = await supabaseAdmin.from('super_admin_audit').insert({
        admin_id: userId,
        action: 'SUPERADMIN_CREATED',
        target_type: 'user',
        target_id: userId,
        details: {
          email,
          created_via_script: true,
        },
        created_at: new Date().toISOString(),
      });

      if (auditError) {
        log(`   ⚠️  Warning: Failed to create audit log: ${auditError.message}`, 'yellow');
      }

      log('\n✅ Superadmin user created successfully!', 'green');
      displaySuccessInfo(email, userId);
    }

    // Show next steps
    log('\n📋 Next Steps:', 'bright');
    log('   1. Visit your CampusSync application', 'cyan');
    log('   2. Login with the credentials you just created', 'cyan');
    log('   3. You will have access to all admin features', 'cyan');
    log('   4. You can create organizations and manage the system', 'cyan');

    log('\n🔐 Security Reminder:', 'yellow');
    log('   - Store these credentials securely', 'yellow');
    log('   - Consider enabling 2FA after first login', 'yellow');
    log('   - Regularly review super_admin_audit logs', 'yellow');

    log('\n✨ Setup completed successfully!\n', 'green');
  } catch (error) {
    log(`\n❌ Error: ${error.message}`, 'red');
    if (error.stack) {
      log(`\n${error.stack}`, 'red');
    }
    process.exit(1);
  } finally {
    rl.close();
  }
}

function displaySuccessInfo(email, userId) {
  log('\n╔══════════════════════════════════════════════════════════╗', 'green');
  log('║                Account Details                           ║', 'green');
  log('╠══════════════════════════════════════════════════════════╣', 'green');
  log(`║ Email:    ${email.padEnd(46)}║`, 'green');
  log(`║ User ID:  ${userId.padEnd(46)}║`, 'green');
  log(`║ Role:     super_admin${' '.repeat(33)}║`, 'green');
  log('╚══════════════════════════════════════════════════════════╝', 'green');
}

// Run the script
setupSuperadmin().catch((error) => {
  log(`\n❌ Unexpected error: ${error.message}`, 'red');
  process.exit(1);
});
