#!/usr/bin/env node

/**
 * Test script to verify admin client functionality
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

const adminSupabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function testAdminClient() {
  try {
    console.log('🧪 Testing admin client functionality...');
    
    // Test 1: List users (admin function)
    console.log('\n1. Testing getUserByEmail...');
    const { data: users, error: listError } = await adminSupabase.auth.admin.listUsers({
      page: 1,
      perPage: 5
    });
    
    if (listError) {
      console.error('❌ Error listing users:', listError.message);
      return;
    }
    
    console.log(`✅ Successfully listed ${users.users.length} users`);
    
    if (users.users.length > 0) {
      const testEmail = users.users[0].email;
      console.log(`\n2. Testing getUserByEmail with: ${testEmail}`);
      
      const { data: userData, error: userError } = await adminSupabase.auth.admin.getUserByEmail(testEmail);
      
      if (userError) {
        console.error('❌ Error getting user by email:', userError.message);
        return;
      }
      
      console.log('✅ Successfully retrieved user by email');
      console.log(`   User ID: ${userData.user?.id}`);
      console.log(`   Email: ${userData.user?.email}`);
    }
    
    console.log('\n🎉 Admin client is working correctly!');
    
  } catch (error) {
    console.error('❌ Unexpected error:', error.message);
  }
}

testAdminClient();
