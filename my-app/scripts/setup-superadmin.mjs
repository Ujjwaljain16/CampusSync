#!/usr/bin/env node

/**
 * Setup First Superadmin User Script
 *
 * This script creates the initial superadmin account for CampusSync, or
 * upgrades an existing user to superadmin.
 * Superadmins have system-wide access across all organizations and can:
 * - Manage all organizations
 * - Review the audit_logs trail
 * - Manage system settings
 *
 * Usage:
 *   node scripts/setup-superadmin.mjs
 *
 * Environment (loaded from .env.local when present, Node 20.12+/22):
 *   - NEXT_PUBLIC_SUPABASE_URL
 *   - NEXT_PUBLIC_SUPABASE_ANON_KEY
 *   - SUPABASE_SERVICE_ROLE_KEY (for admin operations)
 *
 * The password is read without echo and is never printed.
 */

import { createClient } from '@supabase/supabase-js';
import readline from 'readline';
import { Writable } from 'stream';

// Load .env.local when the runtime supports it (Node 20.12+/22). Existing
// environment variables win; failure (missing file / older Node) is fine.
try {
  process.loadEnvFile?.('.env.local');
} catch {
  // no .env.local - rely on the real environment
}

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

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// Output stream that can be muted while the password is typed
let muted = false;
const mutableStdout = new Writable({
  write(chunk, encoding, callback) {
    if (!muted) process.stdout.write(chunk, encoding);
    callback();
  },
});

const rl = readline.createInterface({
  input: process.stdin,
  output: mutableStdout,
  terminal: Boolean(process.stdin.isTTY),
});

function question(query) {
  return new Promise((resolve) => {
    process.stdout.write(query);
    rl.question('', resolve);
  });
}

// Prompt without echoing the typed characters
function questionHidden(query) {
  return new Promise((resolve) => {
    process.stdout.write(query);
    muted = true;
    rl.question('', (answer) => {
      muted = false;
      process.stdout.write('\n');
      resolve(answer);
    });
  });
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// At least 12 characters, with an uppercase letter, a lowercase letter and a digit
function isValidPassword(password) {
  return (
    typeof password === 'string' &&
    password.length >= 12 &&
    /[A-Z]/.test(password) &&
    /[a-z]/.test(password) &&
    /[0-9]/.test(password)
  );
}

// Canonical audit_logs row (actor_id, organization_id, action, target_type, target_id, details, created_at).
// A failed audit insert is only a warning: the account itself is already set up.
async function writeSetupAudit(admin, userId, action, email) {
  const { error } = await admin.from('audit_logs').insert({
    actor_id: userId,
    organization_id: null,
    action,
    target_type: 'user',
    target_id: userId,
    details: { email, via: 'setup-script', target_type: 'user' },
    created_at: new Date().toISOString(),
  });
  if (error) {
    log(`   Warning: Failed to create audit log: ${error.message}`, 'yellow');
  }
}

// Paginated lookup: auth.admin.listUsers() only returns one page at a time
async function findUserByEmail(admin, email) {
  const target = email.trim().toLowerCase();
  const perPage = 1000;
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(`Failed to check existing users: ${error.message}`);
    const users = data?.users ?? [];
    const match = users.find((u) => u.email?.toLowerCase() === target);
    if (match) return match;
    if (users.length < perPage) return null;
  }
  return null;
}

// user_roles is multi-row per user with UNIQUE NULLS NOT DISTINCT (user_id, organization_id),
// so there is no unique key on user_id alone: select, then update or insert.
// A super admin row has organization_id NULL (that is how org context detects it).
async function ensureSuperAdminRole(admin, userId) {
  const now = new Date().toISOString();

  const { data: rows, error: selectError } = await admin
    .from('user_roles')
    .select('id, role, organization_id')
    .eq('user_id', userId);
  if (selectError) throw new Error(`Failed to read user roles: ${selectError.message}`);

  const existingRows = rows ?? [];
  const nullOrgRow = existingRows.find((r) => r.organization_id === null);
  // No org-less row yet: convert the user's only org-bound row (clearing organization_id)
  const convertRow = !nullOrgRow && existingRows.length === 1 ? existingRows[0] : null;
  const target = nullOrgRow ?? convertRow;

  if (target) {
    const { error } = await admin
      .from('user_roles')
      .update({
        role: 'super_admin',
        organization_id: null,
        approval_status: 'approved',
        assigned_by: userId,
        updated_at: now,
      })
      .eq('id', target.id);
    if (error) throw new Error(`Failed to update user role: ${error.message}`);
    return;
  }

  const { error } = await admin.from('user_roles').insert({
    user_id: userId,
    role: 'super_admin',
    organization_id: null,
    approval_status: 'approved',
    assigned_by: userId,
    created_at: now,
    updated_at: now,
  });
  if (error) throw new Error(`Failed to create user role: ${error.message}`);
}

async function setupSuperadmin() {
  log('\nCampusSync Superadmin Setup Script', 'cyan');
  log('-----------------------------------\n', 'cyan');

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
    log('Error: Missing required environment variables', 'red');
    log('   Please ensure the following are set in your .env.local:', 'yellow');
    log('   - NEXT_PUBLIC_SUPABASE_URL', 'yellow');
    log('   - NEXT_PUBLIC_SUPABASE_ANON_KEY', 'yellow');
    log('   - SUPABASE_SERVICE_ROLE_KEY', 'yellow');
    rl.close();
    process.exit(1);
  }

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  log('Connected to Supabase', 'green');

  try {
    log('\nPlease provide the following information:\n', 'bright');

    let email = '';
    while (!email || !isValidEmail(email)) {
      email = (await question('Email address: ')).trim();
      if (!isValidEmail(email)) {
        log('   Invalid email format. Please try again.', 'yellow');
      }
    }

    log('\nChecking if user already exists...', 'blue');
    const existingUser = await findUserByEmail(supabaseAdmin, email);

    if (existingUser) {
      log(`\nUser with email ${email} already exists.`, 'yellow');
      const proceed = await question('Do you want to upgrade this user to superadmin? (yes/no): ');

      if (proceed.toLowerCase() !== 'yes' && proceed.toLowerCase() !== 'y') {
        log('\nOperation cancelled', 'red');
        rl.close();
        return;
      }

      log('\nUpgrading user to superadmin...', 'blue');

      await ensureSuperAdminRole(supabaseAdmin, existingUser.id);

      const { error: profileError } = await supabaseAdmin
        .from('profiles')
        .update({
          // No role here: profiles has no role column; the super_admin row in user_roles is the authority
          organization_id: null, // Superadmins are not bound to any organization
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingUser.id);

      if (profileError) {
        throw new Error(`Failed to update profile: ${profileError.message}`);
      }

      await writeSetupAudit(supabaseAdmin, existingUser.id, 'superadmin_upgraded', existingUser.email ?? email);

      log('\nUser successfully upgraded to superadmin.', 'green');
      displaySuccessInfo(email, existingUser.id);
    } else {
      // Collect the remaining details only for a brand new user
      let password = '';
      while (!isValidPassword(password)) {
        password = await questionHidden('Password (min 12 chars, upper + lower case + digit): ');
        if (!isValidPassword(password)) {
          log('   Password must be at least 12 characters and contain an uppercase letter, a lowercase letter and a digit.', 'yellow');
          continue;
        }
        const confirm = await questionHidden('Confirm password: ');
        if (confirm !== password) {
          log('   Passwords do not match. Please try again.', 'yellow');
          password = '';
        }
      }

      const fullName = (await question('Full Name: ')).trim();
      const phone = (await question('Phone Number (optional): ')).trim();

      log('\nCreating new superadmin user...', 'blue');

      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true, // Auto-confirm email for superadmin
        user_metadata: { full_name: fullName },
      });

      if (authError) {
        throw new Error(`Failed to create auth user: ${authError.message}`);
      }

      log('   Auth user created', 'green');

      const userId = authData.user.id;

      // Profile (may already exist if a database trigger created it)
      const { error: profileError } = await supabaseAdmin.from('profiles').upsert(
        {
          id: userId,
          email,
          full_name: fullName,
          phone: phone || null,
          organization_id: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' }
      );

      if (profileError) {
        throw new Error(`Failed to create profile: ${profileError.message}`);
      }

      log('   Profile created', 'green');

      await ensureSuperAdminRole(supabaseAdmin, userId);

      log('   Role assigned', 'green');

      await writeSetupAudit(supabaseAdmin, userId, 'superadmin_created', email);

      log('\nSuperadmin user created successfully.', 'green');
      displaySuccessInfo(email, userId);
    }

    log('\nNext Steps:', 'bright');
    log('   1. Visit your CampusSync application', 'cyan');
    log('   2. Login with the credentials you just created', 'cyan');
    log('   3. You will have access to all admin features', 'cyan');

    log('\nSecurity Reminder:', 'yellow');
    log('   - Store these credentials securely', 'yellow');
    log('   - Consider enabling 2FA after first login', 'yellow');
    log('   - Regularly review the audit_logs trail', 'yellow');

    log('\nSetup completed successfully.\n', 'green');
  } catch (error) {
    // Message only: never dump stacks/objects that could contain request details
    log(`\nError: ${error instanceof Error ? error.message : 'Unknown error'}`, 'red');
    process.exitCode = 1;
  } finally {
    rl.close();
  }
}

function displaySuccessInfo(email, userId) {
  log('\nAccount Details', 'green');
  log(`  Email:    ${email}`, 'green');
  log(`  User ID:  ${userId}`, 'green');
  log('  Role:     super_admin', 'green');
}

// Run the script
setupSuperadmin().catch((error) => {
  log(`\nUnexpected error: ${error instanceof Error ? error.message : 'Unknown error'}`, 'red');
  process.exit(1);
});
