const crypto = require('crypto');

/**
 * Generate a simple JWK for development VC issuance
 * This creates a basic JWK structure for testing
 */
function generateSimpleVCJWK() {
  console.log('🔐 Generating Simple VC Issuer JWK for Development...\n');

  // Generate a unique key ID
  const keyId = `key-${crypto.randomUUID().split('-')[0]}`;
  
  // Create a simple JWK for development
  // Note: This is for development only - use proper key generation in production
  const jwk = {
    kty: 'RSA',
    use: 'sig',
    kid: keyId,
    alg: 'RS256',
    // These are placeholder values for development
    // In production, you'd generate real RSA key components
    n: 'placeholder-n-value-for-development',
    e: 'AQAB',
    d: 'placeholder-d-value-for-development',
    p: 'placeholder-p-value-for-development',
    q: 'placeholder-q-value-for-development',
    dp: 'placeholder-dp-value-for-development',
    dq: 'placeholder-dq-value-for-development',
    qi: 'placeholder-qi-value-for-development'
  };

  console.log('✅ Development JWK Generated!');
  console.log('📋 Add this to your .env.local file:\n');
  console.log('VC_ISSUER_JWK=' + JSON.stringify(jwk));
  console.log('\n🔗 Also add these DID-related environment variables:');
  console.log('NEXT_PUBLIC_ISSUER_DID=did:web:localhost:3000');
  console.log('NEXT_PUBLIC_ISSUER_VERIFICATION_METHOD=did:web:localhost:3000#' + keyId);
  console.log('\n⚠️  This is a development JWK with placeholder values!');
  console.log('💡 For production, use a proper key generation library.');

  return jwk;
}

// Run the generator
if (require.main === module) {
  generateSimpleVCJWK();
}

module.exports = { generateSimpleVCJWK };
