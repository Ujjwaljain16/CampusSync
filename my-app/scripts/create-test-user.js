const { createClient } = require('@supabase/supabase-js');

// This script creates a test user that's already confirmed
// You need to set SUPABASE_SERVICE_ROLE_KEY in your environment

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing environment variables:');
  console.error('- NEXT_PUBLIC_SUPABASE_URL');
  console.error('- SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function createTestUser(email, password) {
  try {
    console.log(`Creating test user: ${email}`);
    
    // Create user with admin client (bypasses email confirmation)
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // This confirms the email immediately
      user_metadata: {
        invited_role: 'student'
      }
    });
    
    if (error) {
      console.error('Error creating user:', error);
    } else {
      console.log('Test user created successfully!');
      console.log('User ID:', data.user.id);
      console.log('Email confirmed:', data.user.email_confirmed_at);
      console.log('You can now sign in with this user.');
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

// Get email and password from command line arguments
const email = process.argv[2] || 'teststudent@university.edu';
const password = process.argv[3] || 'password123';

createTestUser(email, password);



