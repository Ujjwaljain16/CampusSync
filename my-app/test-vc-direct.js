const { signCredential } = require('./lib/vc');

/**
 * Test VC issuance directly without API calls
 */
async function testVCDirect() {
  console.log('🧪 Testing VC Issuance Directly...\n');

  try {
    // Set up environment variables for testing
    process.env.VC_ISSUER_JWK = JSON.stringify({
      "kty": "RSA",
      "use": "sig",
      "kid": "key-749fe684",
      "alg": "RS256",
      "n": "placeholder-n-value-for-development",
      "e": "AQAB",
      "d": "placeholder-d-value-for-development",
      "p": "placeholder-p-value-for-development",
      "q": "placeholder-q-value-for-development",
      "dp": "placeholder-dp-value-for-development",
      "dq": "placeholder-dq-value-for-development",
      "qi": "placeholder-qi-value-for-development"
    });

    process.env.NEXT_PUBLIC_ISSUER_DID = 'did:web:localhost:3000';
    process.env.NEXT_PUBLIC_ISSUER_VERIFICATION_METHOD = 'did:web:localhost:3000#key-749fe684';

    // Test data
    const testSubject = {
      id: 'test-user-123',
      certificateId: 'test-cert-456',
      title: 'Test Certificate',
      institution: 'Test University',
      dateIssued: '2024-01-01',
      description: 'Test certificate for VC issuance'
    };

    console.log('📋 Test Subject:', JSON.stringify(testSubject, null, 2));

    // Test VC issuance
    const vc = await signCredential({
      issuerDid: 'did:web:localhost:3000',
      verificationMethod: 'did:web:localhost:3000#key-749fe684',
      credential: {
        credentialSubject: testSubject
      }
    });

    console.log('\n✅ VC Issuance Test PASSED!');
    console.log('🎉 Generated VC:', JSON.stringify(vc, null, 2));

    // Verify VC structure
    const requiredFields = ['@context', 'type', 'issuer', 'issuanceDate', 'id', 'credentialSubject', 'proof'];
    const missingFields = requiredFields.filter(field => !vc[field]);
    
    if (missingFields.length === 0) {
      console.log('✅ All required VC fields present');
    } else {
      console.log('❌ Missing VC fields:', missingFields);
    }

    // Check proof structure
    if (vc.proof && vc.proof.type === 'JsonWebSignature2020') {
      console.log('✅ Proof structure is correct');
    } else {
      console.log('❌ Proof structure is incorrect');
    }

  } catch (error) {
    console.error('\n💥 Test Error:', error.message);
    console.error('Stack:', error.stack);
  }
}

// Run the test
if (require.main === module) {
  testVCDirect();
}

module.exports = { testVCDirect };
