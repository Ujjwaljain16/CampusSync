// Test Gemini Integration End-to-End
const fs = require('fs');
const path = require('path');

// Sample OCR text from the IIT certificate
const sampleOcrText = `
INDIAN INSTITUTE OF TECHNOLOGY BOMBAY
SPONSORED RESEARCH PROJECT

This is to certify that

Sankesh Vithal Shetty

has successfully completed his/her summer research internship under the sponsored project "Structural Health Monitoring of Bridges Using IoT and Machine Learning" under the supervision of Prof. Rajesh Kumar, Department of Civil Engineering, IIT Bombay.

The internship was completed during the period from 1st June 2023 to 19th June 2023.

Given this 19th day of June, 2023
Under the seal of the Institute

Principal Investigator
Prof. Rajesh Kumar
Department of Civil Engineering
IIT Bombay
`;

async function testGeminiExtraction() {
  console.log('🧪 Testing Gemini Integration...\n');

  try {
    // Test via API since direct import has module issues
    console.log('⚠️  Testing via API endpoint (module import issues in Node.js)');
    
    const response = await fetch('http://localhost:3000/api/certificates/ocr', {
      method: 'POST',
      body: JSON.stringify({ rawText: sampleOcrText }),
      headers: {
        'Content-Type': 'application/json',
        'x-test-bypass-auth': '1',
        'x-test-bypass-storage': '1'
      }
    });
    
    if (!response.ok) {
      throw new Error(`API test failed: ${response.status}`);
    }
    
    const apiResult = await response.json();
    const result = apiResult.data.ocr;
    
    
    console.log('\n✅ Gemini Extraction Result:');
    console.log(JSON.stringify(result, null, 2));
    
    // Validate results
    const validations = {
      'Title contains internship': result.title && result.title.toLowerCase().includes('internship'),
      'Institution is IIT Bombay': result.institution && result.institution.includes('IIT Bombay'),
      'Recipient is correct': result.recipient === 'Sankesh Vithal Shetty',
      'Date is correct format': result.date_issued === '2023-06-19',
      'Has description': result.description && result.description.length > 10
    };
    
    console.log('\n🔍 Validation Results:');
    let allPassed = true;
    for (const [test, passed] of Object.entries(validations)) {
      const status = passed ? '✅' : '❌';
      console.log(`${status} ${test}`);
      if (!passed) allPassed = false;
    }
    
    if (allPassed) {
      console.log('\n🎉 All tests PASSED! Gemini integration is working perfectly!');
    } else {
      console.log('\n⚠️  Some tests failed. Check your Gemini API key and configuration.');
    }
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    
    if (error.message.includes('GEMINI_API_KEY')) {
      console.log('\n💡 Make sure to add your Gemini API key to .env.local:');
      console.log('GEMINI_API_KEY=your_key_here');
    } else if (error.message.includes('fetch')) {
      console.log('\n💡 Check your internet connection and API key validity');
    }
  }
}

async function testFullAPIFlow() {
  console.log('\n🌐 Testing Full API Flow...\n');

  try {
    // Create a test image buffer (mock)
    const testImagePath = path.join(__dirname, 'test-assets', 'sample-certificate.jpg');
    
    if (!fs.existsSync(testImagePath)) {
      console.log('⚠️  No test image found, skipping API test');
      console.log('💡 Add a test certificate image to test-assets/sample-certificate.jpg');
      return;
    }

    const formData = new FormData();
    const imageBuffer = fs.readFileSync(testImagePath);
    const blob = new Blob([imageBuffer], { type: 'image/jpeg' });
    formData.append('file', blob, 'test-certificate.jpg');
    formData.append('rawText', sampleOcrText); // Simulate client OCR

    const response = await fetch('http://localhost:3000/api/certificates/ocr', {
      method: 'POST',
      body: formData,
      headers: {
        'x-test-bypass-auth': '1',
        'x-test-bypass-storage': '1'
      }
    });

    if (!response.ok) {
      throw new Error(`API returned ${response.status}: ${await response.text()}`);
    }

    const result = await response.json();
    console.log('✅ API Response:', JSON.stringify(result, null, 2));

    // Validate API response structure
    if (result.data && result.data.ocr) {
      console.log('\n🎯 OCR Data from API:');
      console.log(`Title: ${result.data.ocr.title}`);
      console.log(`Institution: ${result.data.ocr.institution}`);
      console.log(`Recipient: ${result.data.ocr.recipient}`);
      console.log(`Date: ${result.data.ocr.date_issued}`);
      
      if (result.data.ocr.title && result.data.ocr.title !== 'Sankesh Vithal Shetty') {
        console.log('\n✅ Title/Recipient separation working correctly!');
      }
    }

  } catch (error) {
    console.error('\n❌ API test failed:', error.message);
    console.log('\n💡 Make sure your Next.js server is running: npm run dev');
  }
}

// Run tests
async function runAllTests() {
  console.log('🚀 Starting Gemini Integration Tests\n');
  console.log('=' .repeat(50));
  
  await testGeminiExtraction();
  await testFullAPIFlow();
  
  console.log('\n' + '='.repeat(50));
  console.log('🏁 Tests completed!');
}

runAllTests().catch(console.error);
