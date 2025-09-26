// Migration script to backfill certificates to documents table
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function migrateCertificatesToDocuments() {
  console.log('Starting migration from certificates to documents...');
  
  try {
    // Get all certificates
    const { data: certificates, error: fetchError } = await supabase
      .from('certificates')
      .select('*')
      .order('created_at', { ascending: true });

    if (fetchError) {
      throw new Error(`Failed to fetch certificates: ${fetchError.message}`);
    }

    console.log(`Found ${certificates.length} certificates to migrate`);

    let successCount = 0;
    let errorCount = 0;

    for (const cert of certificates) {
      try {
        // Map certificate fields to document fields
        const documentData = {
          student_id: cert.student_id,
          user_id: cert.user_id,
          document_type: cert.document_type || 'certificate',
          title: cert.title || 'Certificate',
          institution: cert.institution,
          issue_date: cert.issue_date,
          file_url: cert.file_url,
          ocr_text: cert.ocr_text,
          ocr_confidence: cert.ocr_confidence,
          verification_status: cert.verification_status || 'pending',
          metadata: {
            ...cert.metadata,
            migrated_from: 'certificates',
            original_id: cert.id
          }
        };

        // Insert into documents table
        const { error: insertError } = await supabase
          .from('documents')
          .insert(documentData);

        if (insertError) {
          console.error(`Failed to migrate certificate ${cert.id}:`, insertError.message);
          errorCount++;
          continue;
        }

        // Migrate certificate metadata to document_metadata
        if (cert.ai_confidence_score !== undefined || cert.verification_details) {
          const { data: newDoc } = await supabase
            .from('documents')
            .select('id')
            .eq('metadata->original_id', cert.id)
            .single();

          if (newDoc) {
            await supabase
              .from('document_metadata')
              .insert({
                document_id: newDoc.id,
                ai_confidence_score: cert.ai_confidence_score,
                verification_details: cert.verification_details,
                created_at: cert.created_at,
                updated_at: cert.updated_at
              });
          }
        }

        successCount++;
        if (successCount % 10 === 0) {
          console.log(`Migrated ${successCount} certificates...`);
        }

      } catch (error) {
        console.error(`Error migrating certificate ${cert.id}:`, error.message);
        errorCount++;
      }
    }

    console.log(`\nMigration completed:`);
    console.log(`✅ Successfully migrated: ${successCount}`);
    console.log(`❌ Failed to migrate: ${errorCount}`);
    console.log(`📊 Total processed: ${certificates.length}`);

  } catch (error) {
    console.error('Migration failed:', error.message);
    process.exit(1);
  }
}

async function verifyMigration() {
  console.log('\nVerifying migration...');
  
  try {
    const { data: certCount } = await supabase
      .from('certificates')
      .select('id', { count: 'exact', head: true });

    const { data: docCount } = await supabase
      .from('documents')
      .select('id', { count: 'exact', head: true });

    console.log(`Certificates: ${certCount}`);
    console.log(`Documents: ${docCount}`);

    // Check for migrated documents
    const { data: migratedDocs } = await supabase
      .from('documents')
      .select('id, metadata')
      .not('metadata->migrated_from', 'is', null);

    console.log(`Migrated documents: ${migratedDocs?.length || 0}`);

  } catch (error) {
    console.error('Verification failed:', error.message);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case 'migrate':
      await migrateCertificatesToDocuments();
      break;
    case 'verify':
      await verifyMigration();
      break;
    case 'full':
      await migrateCertificatesToDocuments();
      await verifyMigration();
      break;
    default:
      console.log('Usage: node migrate-to-documents.js [migrate|verify|full]');
      console.log('  migrate - Migrate certificates to documents');
      console.log('  verify  - Verify migration results');
      console.log('  full    - Run migration and verification');
      break;
  }
}

main().catch(console.error);
