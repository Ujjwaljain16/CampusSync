const fetch = require('node-fetch');

/**
 * Test VC issuance functionality
 */
async function testVCIssuance() {
  console.log('🧪 Testing VC Issuance...\n');

  try {
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
    const response = await fetch('http://localhost:3000/api/certificates/issue', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ credentialSubject: testSubject }),
    });

    console.log('📡 Response Status:', response.status);
    console.log('📡 Response Headers:', Object.fromEntries(response.headers.entries()));

    const responseText = await response.text();
    console.log('📄 Response Body:', responseText);

    if (response.ok) {
      const data = JSON.parse(responseText);
      console.log('\n✅ VC Issuance Test PASSED!');
      console.log('🎉 Generated VC:', JSON.stringify(data.data, null, 2));
    } else {
      console.log('\n❌ VC Issuance Test FAILED!');
      console.log('Error:', responseText);
    }

  } catch (error) {
    console.error('\n💥 Test Error:', error.message);
    console.error('Stack:', error.stack);
  }
}

// Run the test
if (require.main === module) {
  testVCIssuance();
}

module.exports = { testVCIssuance };
