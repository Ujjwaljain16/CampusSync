const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function assignRecruiterRole() {
  console.log('🔍 Assigning recruiter role to existing user...\n');

  try {
    // 1. Get existing user
    const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers();
    
    if (authError) {
      console.error('❌ Error fetching users:', authError);
      return;
    }

    const testUser = authUsers.users.find(user => user.email === 'recruiter@test.com');
    
    if (!testUser) {
      console.error('❌ Test user not found. Please create a user first.');
      return;
    }

    console.log('✅ Found user:', testUser.email);

    // 2. Check if profile exists
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', testUser.id)
      .single();

    if (profileError) {
      console.log('📝 Creating profile...');
      const { error: createProfileError } = await supabase
        .from('profiles')
        .insert({
          id: testUser.id,
          name: 'Test Recruiter'
        });

      if (createProfileError) {
        console.error('❌ Error creating profile:', createProfileError);
        return;
      }
      console.log('✅ Profile created');
    } else {
      console.log('✅ Profile already exists');
    }

    // 3. Check if role already exists
    const { data: existingRole, error: roleCheckError } = await supabase
      .from('user_roles')
      .select('*')
      .eq('user_id', testUser.id)
      .single();

    if (existingRole) {
      console.log('🔄 Updating existing role...');
      const { error: updateError } = await supabase
        .from('user_roles')
        .update({
          role: 'recruiter',
          updated_at: new Date().toISOString()
        })
        .eq('user_id', testUser.id);

      if (updateError) {
        console.error('❌ Error updating role:', updateError);
        return;
      }
      console.log('✅ Role updated to recruiter');
    } else {
      console.log('📝 Creating recruiter role...');
      const { error: roleError } = await supabase
        .from('user_roles')
        .insert({
          user_id: testUser.id,
          role: 'recruiter',
          assigned_by: testUser.id,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });

      if (roleError) {
        console.error('❌ Error assigning role:', roleError);
        return;
      }
      console.log('✅ Recruiter role assigned');
    }

    console.log('\n🎉 Recruiter role assignment completed!');
    console.log('📧 Email: recruiter@test.com');
    console.log('🔑 Password: password123');
    console.log('🔗 Login at: http://localhost:3000/login');
    console.log('📊 Dashboard: http://localhost:3000/recruiter/dashboard');

  } catch (error) {
    console.error('💥 Error assigning recruiter role:', error);
  }
}

assignRecruiterRole();
