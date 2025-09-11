// Script to set up the first admin user
// Run this after creating the user_roles table in Supabase

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
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // You'll need to add this to your .env.local

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase credentials. Please set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function setupAdmin() {
  console.log('Setting up admin user...');
  
  // First, get all users to see who exists
  const { data: users, error: usersError } = await supabase.auth.admin.listUsers();
  
  if (usersError) {
    console.error('Error fetching users:', usersError);
    return;
  }
  
  console.log('Available users:');
  users.users.forEach((user, index) => {
    console.log(`${index + 1}. ${user.email} (${user.id})`);
  });
  
  // For now, let's assign the first user as admin
  if (users.users.length > 0) {
    const firstUser = users.users[0];
    console.log(`\nAssigning admin role to: ${firstUser.email}`);
    
    const { error: roleError } = await supabase
      .from('user_roles')
      .upsert({
        user_id: firstUser.id,
        role: 'admin',
        assigned_by: firstUser.id, // Self-assigned for first admin
        updated_at: new Date().toISOString()
      });
    
    if (roleError) {
      console.error('Error assigning admin role:', roleError);
    } else {
      console.log('✅ Admin role assigned successfully!');
      console.log(`You can now login as ${firstUser.email} to access the admin dashboard.`);
    }
  } else {
    console.log('No users found. Please create a user account first.');
  }
}

setupAdmin().catch(console.error);
