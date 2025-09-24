const { generateKeyPair, exportJWK } = require('jose');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * Production Key Generation Script
 * Generates cryptographically secure keys for production use
 */

async function generateProductionKeys() {
  console.log('🔐 Generating Production-Grade VC Keys...\n');

  try {
    // Generate RSA-2048 key pair for production
    console.log('📝 Generating RSA-2048 key pair...');
    const { publicKey, privateKey } = await generateKeyPair('RS256', {
      modulusLength: 2048, // Production-grade key size
    });

    // Export keys as JWK
    const privateJWK = await exportJWK(privateKey);
    const publicJWK = await exportJWK(publicKey);

    // Generate unique key ID
    const keyId = `prod-key-${crypto.randomUUID().split('-')[0]}`;
    
    // Create production JWK with metadata
    const productionJWK = {
      ...privateJWK,
      kid: keyId,
      use: 'sig',
      alg: 'RS256',
      created_at: new Date().toISOString(),
      key_type: 'production',
      key_size: 2048,
      algorithm: 'RSA'
    };

    // Create backup directory
    const backupDir = path.join(__dirname, '../backups/keys');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    // Save private key (encrypted for production)
    const privateKeyPath = path.join(backupDir, `private-key-${keyId}.json`);
    fs.writeFileSync(privateKeyPath, JSON.stringify(productionJWK, null, 2));

    // Save public key
    const publicKeyPath = path.join(backupDir, `public-key-${keyId}.json`);
    fs.writeFileSync(publicKeyPath, JSON.stringify({
      ...publicJWK,
      kid: keyId,
      use: 'sig',
      alg: 'RS256'
    }, null, 2));

    // Generate environment variables
    const issuerDid = process.env.NEXT_PUBLIC_ISSUER_DID || 'did:web:yourdomain.com';
    const verificationMethod = `${issuerDid}#${keyId}`;

    console.log('✅ Production keys generated successfully!');
    console.log('\n📋 Add these to your .env.local file:');
    console.log('=' .repeat(60));
    console.log(`VC_ISSUER_JWK='${JSON.stringify(productionJWK)}'`);
    console.log(`NEXT_PUBLIC_ISSUER_DID=${issuerDid}`);
    console.log(`NEXT_PUBLIC_ISSUER_VERIFICATION_METHOD=${verificationMethod}`);
    console.log('=' .repeat(60));

    console.log('\n🔒 Security Notes:');
    console.log('• Private key saved to:', privateKeyPath);
    console.log('• Public key saved to:', publicKeyPath);
    console.log('• Keep private key secure and never commit to version control');
    console.log('• Consider using a Hardware Security Module (HSM) for production');
    console.log('• Rotate keys regularly (recommended: every 90 days)');

    console.log('\n🚀 Production Setup:');
    console.log('1. Update your domain in NEXT_PUBLIC_ISSUER_DID');
    console.log('2. Add the environment variables to your production environment');
    console.log('3. Test key generation and signing');
    console.log('4. Set up key rotation schedule');

    return {
      privateKey: productionJWK,
      publicKey: { ...publicJWK, kid: keyId },
      keyId,
      issuerDid,
      verificationMethod
    };

  } catch (error) {
    console.error('❌ Error generating production keys:', error);
    throw error;
  }
}

// Run if called directly
if (require.main === module) {
  generateProductionKeys()
    .then(() => {
      console.log('\n🎉 Production key generation complete!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Key generation failed:', error);
      process.exit(1);
    });
}

module.exports = { generateProductionKeys };
