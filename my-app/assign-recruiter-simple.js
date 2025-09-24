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

    // 2. Create profile with correct column names
    const { error: profileError } = await supabase
      .from('profiles')
      .upsert({
        id: testUser.id,
        full_name: 'Test Recruiter',
        role: 'recruiter',
        created_at: new Date().toISOString()
      });

    if (profileError) {
      console.error('❌ Error creating/updating profile:', profileError);
      return;
    }

    console.log('✅ Profile created/updated');

    // 3. Assign recruiter role in user_roles table
    const { error: roleError } = await supabase
      .from('user_roles')
      .upsert({
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

    console.log('\n🎉 Recruiter setup completed!');
    console.log('📧 Email: recruiter@test.com');
    console.log('🔑 Password: password123');
    console.log('🔗 Login at: http://localhost:3000/login');
    console.log('📊 Dashboard: http://localhost:3000/recruiter/dashboard');

  } catch (error) {
    console.error('💥 Error setting up recruiter:', error);
  }
}

assignRecruiterRole();
