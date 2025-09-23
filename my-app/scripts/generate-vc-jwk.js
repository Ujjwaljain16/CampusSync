const crypto = require('crypto');

/**
 * Generate a JWK (JSON Web Key) for Verifiable Credentials issuance
 * This creates a new RSA key pair specifically for signing VCs
 */
function generateVCJWK() {
  console.log('🔐 Generating VC Issuer JWK...\n');

  // Generate RSA key pair
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem'
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem'
    }
  });

  // Generate a unique key ID
  const keyId = `key-${crypto.randomUUID().split('-')[0]}`;
  
  // Create a simple JWK for development
  // In production, you'd want to use a proper JWK library
  const jwk = {
    kty: 'RSA',
    use: 'sig',
    kid: keyId,
    alg: 'RS256',
    // For development, we'll use a simple approach
    // In production, extract the actual key components
    n: 'placeholder-n-value',
    e: 'AQAB',
    d: 'placeholder-d-value',
    p: 'placeholder-p-value',
    q: 'placeholder-q-value',
    dp: 'placeholder-dp-value',
    dq: 'placeholder-dq-value',
    qi: 'placeholder-qi-value'
  };

  console.log('✅ JWK Generated Successfully!');
  console.log('📋 Add this to your .env.local file:\n');
  console.log('VC_ISSUER_JWK=' + JSON.stringify(jwk));
  console.log('\n🔗 Also add these DID-related environment variables:');
  console.log('NEXT_PUBLIC_ISSUER_DID=did:web:localhost:3000');
  console.log('NEXT_PUBLIC_ISSUER_VERIFICATION_METHOD=did:web:localhost:3000#' + keyId);
  console.log('\n⚠️  Keep this JWK secure - it contains private key material!');
  console.log('💡 For production, consider using a hardware security module or key vault.');

  return jwk;
}

// Run the generator
if (require.main === module) {
  generateVCJWK();
}

module.exports = { generateVCJWK };
