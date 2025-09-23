const { createClient } = require('@supabase/supabase-js');

// This script disables email confirmation for development
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

async function disableEmailConfirmation() {
  try {
    console.log('Disabling email confirmation for development...');
    
    // This would require Supabase Admin API calls
    // For now, we'll just log the instructions
    console.log('\nTo disable email confirmation:');
    console.log('1. Go to your Supabase Dashboard');
    console.log('2. Navigate to Authentication > Settings');
    console.log('3. Under "User Signups", disable "Enable email confirmations"');
    console.log('4. Save the changes');
    console.log('\nAlternatively, you can use the Supabase CLI:');
    console.log('supabase auth settings update --disable-email-confirmations');
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

disableEmailConfirmation();



