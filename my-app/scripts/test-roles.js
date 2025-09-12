// Test script to verify role system is working
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const fs = require('fs');

// Load environment variables from .env.local
function loadEnvFile() {
  const envPath = path.join(__dirname, '..', '.env.local');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
      const [key, ...valueParts] = line.split('=');
      if (key && valueParts.length > 0) {
        const value = valueParts.join('=').trim();
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    });
  }
}

// Load environment variables
loadEnvFile();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase credentials in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testRoleSystem() {
  console.log('🧪 Testing Role System...\n');
  
  try {
    // Test 1: Check if user_roles table exists
    console.log('1. Checking if user_roles table exists...');
    const { data: tables, error: tableError } = await supabase
      .from('user_roles')
      .select('*')
      .limit(1);
    
    if (tableError) {
      console.error('❌ user_roles table not found or not accessible');
      console.error('Error:', tableError.message);
      return;
    }
    console.log('✅ user_roles table exists and is accessible');
    
    // Test 2: Check if there are any users with roles
    console.log('\n2. Checking existing user roles...');
    const { data: roles, error: rolesError } = await supabase
      .from('user_roles')
      .select('*');
    
    if (rolesError) {
      console.error('❌ Error fetching roles:', rolesError.message);
      return;
    }
    
    if (roles.length === 0) {
      console.log('⚠️  No user roles found. You need to create an admin user first.');
      console.log('   Run: node scripts/setup-admin.js');
      return;
    }
    
    console.log(`✅ Found ${roles.length} user(s) with roles:`);
    roles.forEach(role => {
      console.log(`   - User: ${role.user_id.slice(0, 8)}... Role: ${role.role}`);
    });
    
    // Test 3: Check for admin users
    const adminUsers = roles.filter(r => r.role === 'admin');
    if (adminUsers.length === 0) {
      console.log('\n⚠️  No admin users found. You need to create an admin user.');
    } else {
      console.log(`\n✅ Found ${adminUsers.length} admin user(s)`);
    }
    
    console.log('\n🎉 Role system is properly set up!');
    console.log('\nNext steps:');
    console.log('1. Login to your app with an admin user');
    console.log('2. You should be redirected to /admin/dashboard');
    console.log('3. Use the admin dashboard to assign roles to other users');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testRoleSystem();
