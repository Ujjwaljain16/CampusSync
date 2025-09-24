const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function createTestRecruiter() {
  console.log('🔍 Creating test recruiter user...\n');

  try {
    // 1. Create auth user
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: 'recruiter@test.com',
      password: 'password123',
      email_confirm: true
    });

    if (authError) {
      console.error('❌ Error creating auth user:', authError);
      return;
    }

    console.log('✅ Auth user created:', authData.user.email);

    // 2. Create profile
    const { error: profileError } = await supabase
      .from('profiles')
      .insert({
        id: authData.user.id,
        name: 'Test Recruiter',
        university: 'Tech Corp',
        graduation_year: 2020,
        location: 'San Francisco, CA',
        phone: '+1-555-0123',
        linkedin: 'https://linkedin.com/in/test-recruiter',
        github: 'https://github.com/test-recruiter',
        portfolio: 'https://test-recruiter.dev'
      });

    if (profileError) {
      console.error('❌ Error creating profile:', profileError);
      return;
    }

    console.log('✅ Profile created');

    // 3. Assign recruiter role
    const { error: roleError } = await supabase
      .from('user_roles')
      .insert({
        user_id: authData.user.id,
        role: 'recruiter',
        assigned_by: authData.user.id, // Self-assigned for test
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });

    if (roleError) {
      console.error('❌ Error assigning role:', roleError);
      return;
    }

    console.log('✅ Recruiter role assigned');

    console.log('\n🎉 Test recruiter created successfully!');
    console.log('📧 Email: recruiter@test.com');
    console.log('🔑 Password: password123');
    console.log('🔗 Login at: http://localhost:3000/login');
    console.log('📊 Dashboard: http://localhost:3000/recruiter/dashboard');

  } catch (error) {
    console.error('💥 Error creating test recruiter:', error);
  }
}

createTestRecruiter();
