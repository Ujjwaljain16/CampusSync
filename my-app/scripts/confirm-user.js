const { createClient } = require('@supabase/supabase-js');

// This script manually confirms a user for development
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

async function confirmUser(email) {
  try {
    console.log(`Confirming user: ${email}`);
    
    // Get the user by email
    const { data: users, error: listError } = await supabase.auth.admin.listUsers();
    if (listError) {
      console.error('Error listing users:', listError);
      return;
    }
    
    const user = users.users.find(u => u.email === email);
    if (!user) {
      console.error('User not found:', email);
      return;
    }
    
    console.log('Found user:', user.id, user.email);
    console.log('Current confirmation status:', user.email_confirmed_at);
    
    // Update user to confirm email
    const { data, error } = await supabase.auth.admin.updateUserById(user.id, {
      email_confirm: true
    });
    
    if (error) {
      console.error('Error confirming user:', error);
    } else {
      console.log('User confirmed successfully!');
      console.log('User can now sign in normally.');
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

// Get email from command line argument
const email = process.argv[2];
if (!email) {
  console.error('Usage: node confirm-user.js <email>');
  console.error('Example: node confirm-user.js student1@university.edu');
  process.exit(1);
}

confirmUser(email);



