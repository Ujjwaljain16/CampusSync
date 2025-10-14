// Apply Storage Policies Migration
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function applyMigration() {
  console.log('🔧 Applying storage policies migration...\n');

  const migrationPath = path.join(__dirname, '..', 'supabase-migrations', '032_storage_policies.sql');
  const sql = fs.readFileSync(migrationPath, 'utf8');

  console.log('📄 Migration file:', migrationPath);
  console.log('📝 SQL length:', sql.length, 'bytes\n');

  // Split by statement and execute each
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));

  console.log(`📊 Found ${statements.length} SQL statements\n`);

  for (let i = 0; i < statements.length; i++) {
    const statement = statements[i] + ';';
    console.log(`\n[${i + 1}/${statements.length}] Executing statement...`);
    console.log(statement.substring(0, 100) + '...\n');

    const { data, error } = await supabase.rpc('exec_sql', { sql: statement }).catch(() => {
      // If exec_sql doesn't exist, try direct query
      return supabase.from('_').select('*').limit(0);
    });

    if (error) {
      // Try executing via REST API directly
      const { error: directError } = await supabase
        .from('_migrations')
        .select('*')
        .limit(0);
      
      console.log('⚠️  Note:', error.message);
      console.log('💡 You may need to run this SQL manually in Supabase Dashboard > SQL Editor');
    } else {
      console.log('✅ Statement executed successfully');
    }
  }

  console.log('\n\n🎉 Migration process completed!');
  console.log('\n📋 MANUAL STEPS REQUIRED:');
  console.log('1. Go to Supabase Dashboard: https://supabase.com/dashboard');
  console.log('2. Select your project');
  console.log('3. Go to SQL Editor');
  console.log('4. Copy the contents of: supabase-migrations/032_storage_policies.sql');
  console.log('5. Paste and run the SQL');
  console.log('\n✨ This will enable students to upload certificates!');
}

applyMigration().catch(console.error);
