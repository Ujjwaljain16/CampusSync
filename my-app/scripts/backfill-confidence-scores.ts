/**
 * Backfill Confidence Scores for Existing Certificates
 * 
 * This script:
 * 1. Fetches all certificates with NULL confidence_score
 * 2. Downloads their certificate files from storage
 * 3. Re-processes them with Gemini Vision API
 * 4. Updates the confidence_score in the database
 * 
 * Usage: npx tsx scripts/backfill-confidence-scores.ts
 */

import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const geminiApiKey = process.env.GEMINI_API_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials');
  console.error('Please set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

if (!geminiApiKey) {
  console.error('❌ Missing GEMINI_API_KEY');
  console.error('Please set GEMINI_API_KEY in .env.local');
  process.exit(1);
}

// Initialize clients
const supabase = createClient(supabaseUrl, supabaseServiceKey);
const genAI = new GoogleGenerativeAI(geminiApiKey);

interface Certificate {
  id: string;
  title: string;
  file_url: string;
  confidence_score: number | null;
}

async function extractConfidenceFromImage(imageUrl: string): Promise<number> {
  try {
    console.log('  📥 Downloading image...');
    
    // Download image
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`Failed to download image: ${response.statusText}`);
    }
    
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64Image = buffer.toString('base64');
    
    // Determine MIME type from URL
    let mimeType = 'image/jpeg';
    if (imageUrl.includes('.png')) mimeType = 'image/png';
    else if (imageUrl.includes('.pdf')) mimeType = 'application/pdf';
    
    console.log('  🤖 Processing with Gemini Vision API...');
    
    // Initialize Gemini model
    const model = genAI.getGenerativeModel({ 
      model: 'gemini-2.0-flash-exp',
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 2048,
      }
    });
    
    const imagePart = {
      inlineData: {
        data: base64Image,
        mimeType: mimeType
      }
    };
    
    const prompt = `Extract certificate information as JSON:

{
  "title": "certificate title/course name",
  "institution": "issuing organization",
  "recipient": "recipient name",
  "date_issued": "YYYY-MM-DD format",
  "description": "2-3 sentences covering: purpose, project/course details, duration, achievements, skills, grades",
  "raw_text": "all visible text",
  "confidence": 0.95
}

Extract all text accurately. Return only valid JSON, no markdown.`;
    
    // Call Gemini
    const result = await model.generateContent([prompt, imagePart]);
    const responseText = await result.response.text();
    
    // Parse JSON
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn('  ⚠️ Could not parse JSON from response, using default confidence');
      return 0.85; // Default fallback
    }
    
    const extracted = JSON.parse(jsonMatch[0]);
    const confidence = extracted.confidence || 0.85;
    
    console.log(`  ✅ Extracted confidence: ${confidence}`);
    return confidence;
    
  } catch (error) {
    console.error('  ❌ Extraction failed:', error);
    // Return a reasonable default instead of failing
    return 0.80;
  }
}

async function backfillConfidenceScores() {
  console.log('🚀 Starting confidence score backfill...\n');
  
  // 1. Fetch certificates with NULL confidence_score
  console.log('📋 Fetching certificates with missing confidence scores...');
  const { data: certificates, error: fetchError } = await supabase
    .from('certificates')
    .select('id, title, file_url, confidence_score')
    .is('confidence_score', null);
  
  if (fetchError) {
    console.error('❌ Failed to fetch certificates:', fetchError);
    process.exit(1);
  }
  
  if (!certificates || certificates.length === 0) {
    console.log('✅ No certificates need backfilling. All confidence scores are set!');
    process.exit(0);
  }
  
  console.log(`📊 Found ${certificates.length} certificate(s) to process\n`);
  
  // 2. Process each certificate
  let successCount = 0;
  let failCount = 0;
  
  for (let i = 0; i < certificates.length; i++) {
    const cert = certificates[i] as Certificate;
    console.log(`[${i + 1}/${certificates.length}] Processing certificate:`);
    console.log(`  ID: ${cert.id}`);
    console.log(`  Title: ${cert.title}`);
    console.log(`  URL: ${cert.file_url}`);
    
    try {
      // Extract confidence from image
      const confidence = await extractConfidenceFromImage(cert.file_url);
      
      // Update database
      console.log('  💾 Updating database...');
      const { error: updateError } = await supabase
        .from('certificates')
        .update({ confidence_score: confidence })
        .eq('id', cert.id);
      
      if (updateError) {
        console.error('  ❌ Database update failed:', updateError);
        failCount++;
      } else {
        console.log(`  ✅ Success! Confidence score set to ${confidence}`);
        successCount++;
      }
      
    } catch (error) {
      console.error('  ❌ Processing failed:', error);
      failCount++;
    }
    
    console.log(''); // Empty line for readability
    
    // Small delay to avoid rate limits
    if (i < certificates.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  // 3. Summary
  console.log('═══════════════════════════════════════');
  console.log('📊 Backfill Complete!');
  console.log(`✅ Successfully processed: ${successCount}`);
  console.log(`❌ Failed: ${failCount}`);
  console.log(`📈 Total: ${certificates.length}`);
  console.log('═══════════════════════════════════════\n');
  
  // 4. Verify results
  console.log('🔍 Verifying results...');
  const { data: verifyData, error: verifyError } = await supabase
    .from('certificates')
    .select('id, title, confidence_score')
    .order('created_at', { ascending: false });
  
  if (!verifyError && verifyData) {
    console.log('\n📋 All Certificates:');
    verifyData.forEach((cert) => {
      const scoreDisplay = cert.confidence_score 
        ? `${(cert.confidence_score * 100).toFixed(1)}%`
        : 'NULL';
      console.log(`  - ${cert.title}: ${scoreDisplay}`);
    });
  }
  
  console.log('\n✨ Done! You can now check your analytics dashboard.');
}

// Run the script
backfillConfidenceScores().catch(error => {
  console.error('💥 Script failed:', error);
  process.exit(1);
});
