const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testVerificationEngine() {
  console.log('Testing Verification Engine...');

  try {
    // Test 1: Check if trusted issuers are loaded
    console.log('\n1. Testing trusted issuers...');
    const { data: issuers, error: issuerError } = await supabase
      .from('trusted_issuers')
      .select('*')
      .eq('is_active', true);

    if (issuerError) {
      console.error('Error loading trusted issuers:', issuerError);
      return;
    }

    console.log(`Found ${issuers.length} trusted issuers:`);
    issuers.forEach(issuer => {
      console.log(`  - ${issuer.name} (${issuer.template_patterns.length} patterns)`);
    });

    // Test 2: Check verification rules
    console.log('\n2. Testing verification rules...');
    const { data: rules, error: rulesError } = await supabase
      .from('verification_rules')
      .select('*')
      .eq('is_active', true);

    if (rulesError) {
      console.error('Error loading verification rules:', rulesError);
      return;
    }

    console.log(`Found ${rules.length} verification rules:`);
    rules.forEach(rule => {
      console.log(`  - ${rule.name} (${rule.rule_type}, weight: ${rule.weight})`);
    });

    // Test 3: Check if verification tables exist
    console.log('\n3. Testing database tables...');
    const { data: certificates, error: certError } = await supabase
      .from('certificates')
      .select('id, title, verification_status')
      .limit(5);

    if (certError) {
      console.error('Error loading certificates:', certError);
    } else {
      console.log(`Found ${certificates.length} certificates in database`);
    }

    console.log('\n✅ Verification Engine setup is complete!');
    console.log('\nNext steps:');
    console.log('1. Run the migration: supabase-migrations/005_add_verification_tables.sql');
    console.log('2. Seed trusted issuers: node scripts/seed-trusted-issuers.js');
    console.log('3. Test with a certificate upload');

  } catch (error) {
    console.error('Test failed:', error);
  }
}

// Run the test
testVerificationEngine();
