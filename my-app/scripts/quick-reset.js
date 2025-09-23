#!/usr/bin/env node

/**
 * Quick Database Reset Script
 * 
 * This script quickly clears all data without confirmation prompts.
 * Use this for automated testing or when you're sure you want to reset.
 * 
 * Usage: node scripts/quick-reset.js
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function quickReset() {
  console.log('🗑️  Quick database reset...\n');

  try {
    // Delete all data from all tables
    const tables = [
      'user_roles',
      'allowed_domains', 
      'certificates',
      'verification_results',
      'certificate_metadata',
      'verifiable_credentials',
      'revocation_list',
      'trusted_issuers',
      'verification_rules',
      'audit_logs'
    ];

    for (const table of tables) {
      try {
        const { error } = await supabase
          .from(table)
          .delete()
          .neq('id', '00000000-0000-0000-0000-000000000000');
        
        if (error) {
          console.log(`   ⚠️  ${table}: ${error.message}`);
        } else {
          console.log(`   ✅ ${table} cleared`);
        }
      } catch (err) {
        console.log(`   ⚠️  ${table}: ${err.message}`);
      }
    }

    // Delete all auth users
    try {
      const { data: users } = await supabase.auth.admin.listUsers();
      if (users && users.users.length > 0) {
        for (const user of users.users) {
          await supabase.auth.admin.deleteUser(user.id);
        }
        console.log(`   ✅ Deleted ${users.users.length} auth users`);
      }
    } catch (err) {
      console.log(`   ⚠️  Auth users: ${err.message}`);
    }

    // Re-insert default domains
    const defaultDomains = [
      { domain: '.edu', description: 'Generic .edu domains' },
      { domain: '.ac.uk', description: 'UK universities' },
      { domain: '.ac.in', description: 'Indian universities' },
      { domain: 'university.', description: 'Contains university' },
      { domain: 'college.', description: 'Contains college' },
      { domain: 'institute.', description: 'Contains institute' },
      { domain: 'school.', description: 'Contains school' },
      { domain: 'campus.', description: 'Contains campus' }
    ];

    await supabase.from('allowed_domains').insert(defaultDomains);
    console.log('   ✅ Default domains restored');

    console.log('\n🎉 Quick reset completed!');
    console.log('🚀 Ready for testing at http://localhost:3000/setup');

  } catch (error) {
    console.error('❌ Reset failed:', error.message);
    process.exit(1);
  }
}

quickReset();
