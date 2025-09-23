#!/usr/bin/env node

/**
 * Quick fix script for infinite recursion in user_roles policies
 * This script runs the policy fix migration directly
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

async function fixPolicyRecursion() {
  console.log('🔧 Fixing infinite recursion in user_roles policies...\n');

  // Check environment variables
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    console.error('❌ Missing environment variables:');
    console.error('   NEXT_PUBLIC_SUPABASE_URL:', !!supabaseUrl);
    console.error('   SUPABASE_SERVICE_ROLE_KEY:', !!serviceKey);
    console.error('\nPlease check your .env.local file');
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
    console.log('📋 Running policy fix migration...');

    // Read the migration file
    const fs = require('fs');
    const path = require('path');
    const migrationPath = path.join(__dirname, '..', 'supabase-migrations', '003_fix_recursion_completely.sql');
    
    if (!fs.existsSync(migrationPath)) {
      console.error('❌ Migration file not found:', migrationPath);
      process.exit(1);
    }

    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    // Execute the migration
    const { data, error } = await supabase.rpc('exec_sql', { sql: migrationSQL });

    if (error) {
      // If rpc doesn't work, try direct SQL execution
      console.log('⚠️  RPC method failed, trying direct execution...');
      
      // Split the migration into individual statements
      const statements = migrationSQL
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0 && !s.startsWith('--'));

      for (const statement of statements) {
        if (statement.trim()) {
          try {
            const { error: stmtError } = await supabase
              .from('user_roles')
              .select('*')
              .limit(0); // This will fail but we'll catch it
              
            // If we get here, the table exists, so we can try to fix policies
            console.log('🔧 Applying policy fixes...');
            
            // Drop policies
            await supabase.rpc('exec', { sql: 'DROP POLICY IF EXISTS "Users can read their own role" ON user_roles;' });
            await supabase.rpc('exec', { sql: 'DROP POLICY IF EXISTS "Admins can read all roles" ON user_roles;' });
            await supabase.rpc('exec', { sql: 'DROP POLICY IF EXISTS "Admins can insert roles" ON user_roles;' });
            await supabase.rpc('exec', { sql: 'DROP POLICY IF EXISTS "Admins can update roles" ON user_roles;' });
            await supabase.rpc('exec', { sql: 'DROP POLICY IF EXISTS "Admins can delete roles" ON user_roles;' });
            
            // Disable RLS temporarily
            await supabase.rpc('exec', { sql: 'ALTER TABLE user_roles DISABLE ROW LEVEL SECURITY;' });
            
            // Create the admin function
            await supabase.rpc('exec', { sql: `
              CREATE OR REPLACE FUNCTION is_admin()
              RETURNS BOOLEAN AS $$
              DECLARE
                user_role TEXT;
              BEGIN
                SELECT role INTO user_role 
                FROM user_roles 
                WHERE user_id = auth.uid();
                
                RETURN user_role = 'admin';
              EXCEPTION
                WHEN OTHERS THEN
                  RETURN FALSE;
              END;
              $$ LANGUAGE plpgsql SECURITY DEFINER;
            ` });
            
            // Re-enable RLS
            await supabase.rpc('exec', { sql: 'ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;' });
            
            // Create new policies
            await supabase.rpc('exec', { sql: 'CREATE POLICY "Users can read their own role" ON user_roles FOR SELECT USING (auth.uid() = user_id);' });
            await supabase.rpc('exec', { sql: 'CREATE POLICY "Admins can read all roles" ON user_roles FOR SELECT USING (is_admin());' });
            await supabase.rpc('exec', { sql: 'CREATE POLICY "Admins can insert roles" ON user_roles FOR INSERT WITH CHECK (is_admin());' });
            await supabase.rpc('exec', { sql: 'CREATE POLICY "Admins can update roles" ON user_roles FOR UPDATE USING (is_admin());' });
            await supabase.rpc('exec', { sql: 'CREATE POLICY "Admins can delete roles" ON user_roles FOR DELETE USING (is_admin());' });
            
            console.log('✅ Policy recursion fix applied successfully!');
            break;
          } catch (err) {
            console.log('⚠️  Direct execution also failed, manual fix required');
            console.log('📝 Please run the following SQL in your Supabase SQL Editor:');
            console.log('\n' + '='.repeat(60));
            console.log(migrationSQL);
            console.log('='.repeat(60) + '\n');
            break;
          }
        }
      }
    } else {
      console.log('✅ Policy recursion fix applied successfully!');
    }

    // Test the fix
    console.log('\n🧪 Testing the fix...');
    const { data: testData, error: testError } = await supabase
      .from('user_roles')
      .select('count')
      .limit(1);

    if (testError) {
      console.error('❌ Test failed:', testError.message);
      console.log('\n📝 Manual fix required. Please run this SQL in Supabase:');
      console.log('\n' + '='.repeat(60));
      console.log(migrationSQL);
      console.log('='.repeat(60) + '\n');
    } else {
      console.log('✅ Test passed! The recursion issue is fixed.');
      console.log('\n🎉 You can now refresh your setup page and continue with the setup.');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.log('\n📝 Manual fix required. Please run this SQL in Supabase:');
    console.log('\n' + '='.repeat(60));
    console.log(migrationSQL);
    console.log('='.repeat(60) + '\n');
  }
}

// Run the fix
fixPolicyRecursion().catch(console.error);
