#!/usr/bin/env node
/**
 * Quick script to add institutional email domains to CampusSync
 * Usage: node scripts/add-institution.js
 */

import readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function main() {
  console.log('\n🎓 CampusSync - Add Institution Domain\n');
  
  const name = await question('Institution Name (e.g., Stanford University): ');
  const slug = await question('Slug (e.g., stanford): ');
  const domain = await question('Email Domain (e.g., stanford.edu): ');
  const type = await question('Type (university/college/school/institute) [institute]: ') || 'institute';
  
  console.log('\n📋 Summary:');
  console.log(`   Name: ${name}`);
  console.log(`   Slug: ${slug}`);
  console.log(`   Domain: ${domain}`);
  console.log(`   Type: ${type}`);
  
  const confirm = await question('\n✅ Add this institution? (yes/no): ');
  
  if (confirm.toLowerCase() !== 'yes') {
    console.log('❌ Cancelled');
    rl.close();
    return;
  }
  
  console.log('\n📝 SQL to run in Supabase:');
  console.log('─'.repeat(60));
  
  const sql = `
INSERT INTO public.organizations (
  name,
  slug,
  type,
  email,
  settings
) VALUES (
  '${name}',
  '${slug}',
  '${type}',
  'admin@${domain}',
  jsonb_build_object(
    'timezone', 'UTC',
    'date_format', 'YYYY-MM-DD',
    'language', 'en',
    'allowed_email_domains', '["${domain}"]'::jsonb,
    'require_email_verification', true,
    'enable_sso', false,
    'features', jsonb_build_object(
      'document_verification', true,
      'certificate_issuance', true,
      'student_profiles', true,
      'recruiter_access', true,
      'analytics', true
    )
  )
)
ON CONFLICT (slug) DO UPDATE
SET settings = jsonb_set(
  organizations.settings,
  '{allowed_email_domains}',
  '["${domain}"]'::jsonb
);
  `.trim();
  
  console.log(sql);
  console.log('─'.repeat(60));
  
  console.log('\n✨ Steps:');
  console.log('   1. Copy the SQL above');
  console.log('   2. Go to Supabase Dashboard > SQL Editor');
  console.log('   3. Paste and run the query');
  console.log('   4. Test by signing up with student@' + domain);
  console.log('');
  
  rl.close();
}

main().catch(console.error);
