// Quick check of auto_approved status
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkAutoApproved() {
  const { data, error } = await supabase
    .from('certificates')
    .select('id, title, auto_approved, verification_status, confidence_score');
  
  if (error) {
    console.error('Error:', error);
    return;
  }
  
  console.log('\n📋 Certificate Auto-Approval Status:\n');
  data.forEach(c => {
    console.log(`📄 ${c.title}`);
    console.log(`   Status: ${c.verification_status}`);
    console.log(`   Auto-approved: ${c.auto_approved || 'false'}`);
    console.log(`   Confidence: ${c.confidence_score ? (c.confidence_score * 100).toFixed(1) + '%' : 'N/A'}`);
    console.log('');
  });
  
  const autoApprovedCount = data.filter(c => c.auto_approved === true).length;
  console.log(`\n📊 Summary:`);
  console.log(`   Total certificates: ${data.length}`);
  console.log(`   Auto-approved: ${autoApprovedCount}`);
  console.log(`   Manually approved: ${data.length - autoApprovedCount}`);
}

checkAutoApproved();
