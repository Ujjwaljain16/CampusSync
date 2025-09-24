const { generateKeyPair, exportJWK } = require('jose');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * Production Key Rotation Script
 * Safely rotates keys while maintaining service availability
 */

async function rotateProductionKeys() {
  console.log('🔄 Rotating Production VC Keys...\n');

  try {
    // 1. Generate new key pair
    console.log('📝 Generating new RSA-2048 key pair...');
    const { publicKey, privateKey } = await generateKeyPair('RS256', {
      modulusLength: 2048,
    });

    const privateJWK = await exportJWK(privateKey);
    const publicJWK = await exportJWK(publicKey);
    const newKeyId = `prod-key-${crypto.randomUUID().split('-')[0]}`;

    // 2. Create new production JWK
    const newProductionJWK = {
      ...privateJWK,
      kid: newKeyId,
      use: 'sig',
      alg: 'RS256',
      created_at: new Date().toISOString(),
      key_type: 'production',
      key_size: 2048,
      algorithm: 'RSA',
      rotation_from: 'previous-key-id' // Update this with actual previous key ID
    };

    // 3. Backup current key (if exists)
    const backupDir = path.join(__dirname, '../backups/keys');
    const currentKeyPath = path.join(backupDir, 'current-private-key.json');
    
    if (fs.existsSync(currentKeyPath)) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = path.join(backupDir, `backup-private-key-${timestamp}.json`);
      fs.copyFileSync(currentKeyPath, backupPath);
      console.log('💾 Current key backed up to:', backupPath);
    }

    // 4. Save new keys
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    const newPrivateKeyPath = path.join(backupDir, 'current-private-key.json');
    const newPublicKeyPath = path.join(backupDir, 'current-public-key.json');

    fs.writeFileSync(newPrivateKeyPath, JSON.stringify(newProductionJWK, null, 2));
    fs.writeFileSync(newPublicKeyPath, JSON.stringify({
      ...publicJWK,
      kid: newKeyId,
      use: 'sig',
      alg: 'RS256'
    }, null, 2));

    // 5. Generate new environment variables
    const issuerDid = process.env.NEXT_PUBLIC_ISSUER_DID || 'did:web:yourdomain.com';
    const verificationMethod = `${issuerDid}#${newKeyId}`;

    console.log('✅ Key rotation completed successfully!');
    console.log('\n📋 Update your .env.local with new keys:');
    console.log('=' .repeat(60));
    console.log(`VC_ISSUER_JWK='${JSON.stringify(newProductionJWK)}'`);
    console.log(`NEXT_PUBLIC_ISSUER_DID=${issuerDid}`);
    console.log(`NEXT_PUBLIC_ISSUER_VERIFICATION_METHOD=${verificationMethod}`);
    console.log('=' .repeat(60));

    console.log('\n⚠️  Important Notes:');
    console.log('• Old keys will still verify existing credentials');
    console.log('• New credentials will use the new key');
    console.log('• Update your production environment variables');
    console.log('• Test the new keys before deploying');
    console.log('• Keep old keys for credential verification');

    console.log('\n🔄 Next Steps:');
    console.log('1. Update production environment variables');
    console.log('2. Deploy the new keys');
    console.log('3. Test credential issuance and verification');
    console.log('4. Monitor for any issues');
    console.log('5. Schedule next rotation (recommended: 90 days)');

    return {
      newPrivateKey: newProductionJWK,
      newPublicKey: { ...publicJWK, kid: newKeyId },
      newKeyId,
      issuerDid,
      verificationMethod
    };

  } catch (error) {
    console.error('❌ Error rotating production keys:', error);
    throw error;
  }
}

// Run if called directly
if (require.main === module) {
  rotateProductionKeys()
    .then(() => {
      console.log('\n🎉 Key rotation complete!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Key rotation failed:', error);
      process.exit(1);
    });
}

module.exports = { rotateProductionKeys };
