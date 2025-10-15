#!/usr/bin/env node

/**
 * SECURITY KEY ROTATION HELPER
 * 
 * This script helps you rotate your security keys by:
 * 1. Generating new production VC JWK keys
 * 2. Creating a template .env.production file
 * 3. Providing clear next steps
 * 
 * Run: node scripts/rotate-security-keys.js
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { subtle } = crypto.webcrypto;

const COLORS = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${COLORS[color]}${message}${COLORS.reset}`);
}

function logSection(title) {
  console.log('\n' + '='.repeat(60));
  log(title, 'cyan');
  console.log('='.repeat(60));
}

async function generateProductionJWK() {
  logSection('🔑 Generating Production VC JWK Keys');
  
  try {
    log('Generating RSA-2048 key pair...', 'blue');
    
    const keyPair = await subtle.generateKey(
      {
        name: 'RSASSA-PKCS1-v1_5',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256',
      },
      true,
      ['sign', 'verify']
    );
    
    const jwk = await subtle.exportKey('jwk', keyPair.privateKey);
    const kid = 'key-' + crypto.randomUUID().slice(0, 8);
    
    jwk.kid = kid;
    jwk.alg = 'RS256';
    jwk.use = 'sig';
    
    log('✅ Production JWK keys generated successfully!', 'green');
    
    return { jwk, kid };
  } catch (error) {
    log('❌ Error generating keys: ' + error.message, 'red');
    throw error;
  }
}

function createEnvProductionTemplate(jwk, kid) {
  logSection('📝 Creating .env.production Template');
  
  const envPath = path.join(__dirname, '..', '.env.local');
  const prodEnvPath = path.join(__dirname, '..', '.env.production.template');
  
  let template = `# ========================================
# PRODUCTION ENVIRONMENT VARIABLES
# ========================================
# Copy this to .env.production and fill in the values
# DO NOT commit this file to Git!
# ========================================

# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://stflfunpgyotfznoocaw.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key-here>
NEXT_PUBLIC_SITE_URL=https://yourdomain.com

# 🔴 CRITICAL: Rotate these keys immediately!
# Get new keys from:
# - Supabase: Dashboard → Settings → API → Service Role Key
# - Google AI Studio: https://aistudio.google.com/apikey

SUPABASE_SERVICE_ROLE_KEY=<PASTE-NEW-ROTATED-SUPABASE-KEY-HERE>
GEMINI_API_KEY=<PASTE-NEW-ROTATED-GEMINI-KEY-HERE>

# Verifiable Credentials (PRODUCTION KEYS - GENERATED)
VC_ISSUER_JWK=${JSON.stringify(jwk)}
NEXT_PUBLIC_ISSUER_DID=did:web:yourdomain.com
NEXT_PUBLIC_ISSUER_VERIFICATION_METHOD=did:web:yourdomain.com#${kid}

# Feature Flags
USE_DOCUMENTS_TABLE=true
OCR_ENABLED=true
OCR_SERVICE_URL=https://your-ocr-service.com
GEMINI_MODEL=gemini-2.5-flash
USE_GEMINI_VISION=true

# ========================================
# NEXT STEPS:
# 1. Copy this file to .env.production
# 2. Replace <PASTE-...> placeholders with real values
# 3. Update yourdomain.com to your actual domain
# 4. Add these to your hosting platform (Vercel/Netlify)
# ========================================
`;

  try {
    fs.writeFileSync(prodEnvPath, template);
    log('✅ Created: .env.production.template', 'green');
    log(`   Location: ${prodEnvPath}`, 'blue');
  } catch (error) {
    log('❌ Error creating template: ' + error.message, 'red');
  }
  
  return prodEnvPath;
}

function printNextSteps(jwk, kid, templatePath) {
  logSection('🚀 Next Steps - Security Key Rotation');
  
  console.log('\n📋 Required Actions:\n');
  
  log('1. ROTATE SUPABASE SERVICE ROLE KEY', 'yellow');
  console.log('   a. Go to: https://supabase.com/dashboard/project/stflfunpgyotfznoocaw');
  console.log('   b. Navigate to: Settings → API');
  console.log('   c. Click "Regenerate" next to Service Role Key');
  console.log('   d. Copy the new key\n');
  
  log('2. ROTATE GEMINI API KEY', 'yellow');
  console.log('   a. Go to: https://aistudio.google.com/apikey');
  console.log('   b. DELETE old key: AIzaSyC2wUpucsWk8g5Ykk5CSJHHKKqLyULyaes');
  console.log('   c. Click "Create API Key"');
  console.log('   d. Copy the new key\n');
  
  log('3. UPDATE .env.local FOR DEVELOPMENT', 'yellow');
  console.log('   a. Open: .env.local');
  console.log('   b. Replace SUPABASE_SERVICE_ROLE_KEY with new rotated key');
  console.log('   c. Replace GEMINI_API_KEY with new rotated key');
  console.log('   d. Replace VC_ISSUER_JWK with production keys (see below)\n');
  
  log('4. CREATE .env.production FOR DEPLOYMENT', 'yellow');
  console.log(`   a. Copy: ${templatePath}`);
  console.log('   b. Rename to: .env.production');
  console.log('   c. Fill in all <PASTE-...> placeholders');
  console.log('   d. Update yourdomain.com to your actual domain\n');
  
  log('5. SET ENVIRONMENT VARIABLES IN HOSTING PLATFORM', 'yellow');
  console.log('   For Vercel:');
  console.log('   - Go to: Project Settings → Environment Variables');
  console.log('   - Add each variable from .env.production');
  console.log('   - Mark secrets as "Secret"\n');
  
  log('6. TEST WITH NEW KEYS', 'yellow');
  console.log('   npm run dev');
  console.log('   - Upload certificate (tests Gemini)');
  console.log('   - Approve certificate (tests Supabase)');
  console.log('   - Issue VC (tests VC keys)\n');
  
  logSection('🔑 Your New Production VC Keys');
  
  console.log('\nVC_ISSUER_JWK=');
  log(JSON.stringify(jwk, null, 2), 'green');
  
  console.log('\nNEXT_PUBLIC_ISSUER_DID=');
  log('did:web:yourdomain.com', 'green');
  
  console.log('\nNEXT_PUBLIC_ISSUER_VERIFICATION_METHOD=');
  log(`did:web:yourdomain.com#${kid}`, 'green');
  
  logSection('⚠️  Important Security Notes');
  
  console.log('\n✅ Good news: .env.local was NEVER committed to Git');
  console.log('✅ .env* is already in .gitignore');
  console.log('🔴 ACTION REQUIRED: Rotate Supabase + Gemini keys immediately');
  console.log('📝 Production keys have been generated and saved to template\n');
  
  logSection('📚 Documentation');
  
  console.log('\nFor detailed instructions, see:');
  console.log('  📄 SECURITY-FIX-GUIDE.md - Complete security fix guide');
  console.log('  📄 PRODUCTION-SETUP.md - Production deployment guide');
  console.log('  📄 VC-SETUP-GUIDE.md - Verifiable credential setup\n');
}

async function main() {
  try {
    log('\n🔐 SECURITY KEY ROTATION HELPER', 'magenta');
    log('This script will help you secure your application\n', 'blue');
    
    // Generate production JWK keys
    const { jwk, kid } = await generateProductionJWK();
    
    // Create .env.production template
    const templatePath = createEnvProductionTemplate(jwk, kid);
    
    // Print next steps
    printNextSteps(jwk, kid, templatePath);
    
    log('\n✨ Setup complete! Follow the next steps above.', 'green');
    log('⏱️  Estimated time: 30-45 minutes\n', 'yellow');
    
  } catch (error) {
    log('\n❌ Error: ' + error.message, 'red');
    process.exit(1);
  }
}

main();
