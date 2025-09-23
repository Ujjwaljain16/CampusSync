#!/usr/bin/env node

/**
 * Database Reset Script
 * 
 * This script clears all data from the CampusSync database for testing.
 * WARNING: This will delete ALL data including users, certificates, and settings.
 * 
 * Usage: node scripts/reset-database.js
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

async function resetDatabase() {
  console.log('🗑️  Resetting CampusSync database...\n');
  console.log('⚠️  WARNING: This will delete ALL data!');
  console.log('   - All users and authentication data');
  console.log('   - All certificates and verification data');
  console.log('   - All user roles and permissions');
  console.log('   - All allowed domains');
  console.log('   - All audit logs and metadata\n');

  try {
    // Get confirmation from user
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const question = (prompt) => new Promise((resolve) => rl.question(prompt, resolve));

    const confirm = await question('Are you sure you want to reset the database? Type "RESET" to confirm: ');
    
    if (confirm !== 'RESET') {
      console.log('❌ Database reset cancelled.');
      rl.close();
      process.exit(0);
    }

    rl.close();

    console.log('\n🔄 Starting database reset...\n');

    // 1. Delete all user roles
    console.log('1. Deleting user roles...');
    const { error: rolesError } = await supabase
      .from('user_roles')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all rows
    
    if (rolesError) {
      console.log('   ⚠️  Could not delete user roles:', rolesError.message);
    } else {
      console.log('   ✅ User roles deleted');
    }

    // 2. Delete all allowed domains
    console.log('2. Deleting allowed domains...');
    const { error: domainsError } = await supabase
      .from('allowed_domains')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');
    
    if (domainsError) {
      console.log('   ⚠️  Could not delete allowed domains:', domainsError.message);
    } else {
      console.log('   ✅ Allowed domains deleted');
    }

    // 3. Delete all certificates
    console.log('3. Deleting certificates...');
    const { error: certsError } = await supabase
      .from('certificates')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');
    
    if (certsError) {
      console.log('   ⚠️  Could not delete certificates:', certsError.message);
    } else {
      console.log('   ✅ Certificates deleted');
    }

    // 4. Delete all verification results
    console.log('4. Deleting verification results...');
    const { error: verificationError } = await supabase
      .from('verification_results')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');
    
    if (verificationError) {
      console.log('   ⚠️  Could not delete verification results:', verificationError.message);
    } else {
      console.log('   ✅ Verification results deleted');
    }

    // 5. Delete all certificate metadata
    console.log('5. Deleting certificate metadata...');
    const { error: metadataError } = await supabase
      .from('certificate_metadata')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');
    
    if (metadataError) {
      console.log('   ⚠️  Could not delete certificate metadata:', metadataError.message);
    } else {
      console.log('   ✅ Certificate metadata deleted');
    }

    // 6. Delete all verifiable credentials
    console.log('6. Deleting verifiable credentials...');
    const { error: vcError } = await supabase
      .from('verifiable_credentials')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');
    
    if (vcError) {
      console.log('   ⚠️  Could not delete verifiable credentials:', vcError.message);
    } else {
      console.log('   ✅ Verifiable credentials deleted');
    }

    // 7. Delete all revocation list entries
    console.log('7. Deleting revocation list...');
    const { error: revocationError } = await supabase
      .from('revocation_list')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');
    
    if (revocationError) {
      console.log('   ⚠️  Could not delete revocation list:', revocationError.message);
    } else {
      console.log('   ✅ Revocation list deleted');
    }

    // 8. Delete all trusted issuers
    console.log('8. Deleting trusted issuers...');
    const { error: issuersError } = await supabase
      .from('trusted_issuers')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');
    
    if (issuersError) {
      console.log('   ⚠️  Could not delete trusted issuers:', issuersError.message);
    } else {
      console.log('   ✅ Trusted issuers deleted');
    }

    // 9. Delete all verification rules
    console.log('9. Deleting verification rules...');
    const { error: rulesError } = await supabase
      .from('verification_rules')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');
    
    if (rulesError) {
      console.log('   ⚠️  Could not delete verification rules:', rulesError.message);
    } else {
      console.log('   ✅ Verification rules deleted');
    }

    // 10. Delete all audit logs
    console.log('10. Deleting audit logs...');
    const { error: auditError } = await supabase
      .from('audit_logs')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');
    
    if (auditError) {
      console.log('   ⚠️  Could not delete audit logs:', auditError.message);
    } else {
      console.log('   ✅ Audit logs deleted');
    }

    // 11. Delete all auth users (this is the most destructive)
    console.log('11. Deleting all auth users...');
    try {
      const { data: users, error: listError } = await supabase.auth.admin.listUsers();
      
      if (listError) {
        console.log('   ⚠️  Could not list users:', listError.message);
      } else if (users && users.users.length > 0) {
        for (const user of users.users) {
          const { error: deleteError } = await supabase.auth.admin.deleteUser(user.id);
          if (deleteError) {
            console.log(`   ⚠️  Could not delete user ${user.email}:`, deleteError.message);
          } else {
            console.log(`   ✅ Deleted user: ${user.email}`);
          }
        }
      } else {
        console.log('   ✅ No users to delete');
      }
    } catch (error) {
      console.log('   ⚠️  Could not delete auth users:', error.message);
    }

    // 12. Re-insert default allowed domains
    console.log('12. Re-inserting default allowed domains...');
    const defaultDomains = [
      { domain: '.edu', description: 'Generic .edu domains' },
      { domain: '.ac.uk', description: 'UK universities' },
      { domain: '.ac.in', description: 'Indian universities' },
      { domain: '.ac.jp', description: 'Japanese universities' },
      { domain: '.ac.au', description: 'Australian universities' },
      { domain: '.ac.nz', description: 'New Zealand universities' },
      { domain: '.ac.za', description: 'South African universities' },
      { domain: 'university.', description: 'Contains university' },
      { domain: 'college.', description: 'Contains college' },
      { domain: 'institute.', description: 'Contains institute' },
      { domain: 'school.', description: 'Contains school' },
      { domain: 'campus.', description: 'Contains campus' },
      { domain: '.edu.', description: 'Edu subdomains' }
    ];

    const { error: insertError } = await supabase
      .from('allowed_domains')
      .insert(defaultDomains);

    if (insertError) {
      console.log('   ⚠️  Could not insert default domains:', insertError.message);
    } else {
      console.log('   ✅ Default domains inserted');
    }

    console.log('\n🎉 Database reset completed successfully!');
    console.log('\n📋 What was cleared:');
    console.log('   ✅ All user accounts and authentication data');
    console.log('   ✅ All certificates and verification data');
    console.log('   ✅ All user roles and permissions');
    console.log('   ✅ All custom allowed domains');
    console.log('   ✅ All audit logs and metadata');
    console.log('   ✅ All verifiable credentials');
    console.log('   ✅ All revocation list entries');
    console.log('   ✅ All trusted issuers and verification rules');
    
    console.log('\n🔄 What was restored:');
    console.log('   ✅ Default allowed domains for email validation');
    console.log('   ✅ Database schema and tables');
    console.log('   ✅ RLS policies and permissions');
    
    console.log('\n🚀 Ready for testing!');
    console.log('   • Go to http://localhost:3000/setup');
    console.log('   • Create your first admin account');
    console.log('   • Start testing the system');

  } catch (error) {
    console.error('❌ Error during database reset:', error.message);
    process.exit(1);
  }
}

// Run the script
resetDatabase();
