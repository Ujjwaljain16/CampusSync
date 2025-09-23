#!/usr/bin/env node

const BASE_URL = 'http://localhost:3000';

async function testIITCertificate() {
  console.log('🧪 Testing IIT Bombay Certificate OCR...\n');
  
  // This is what OCR would likely extract from the certificate image
  const ocrText = `INDIAN INSTITUTE OF TECHNOLOGY BOMBAY

upon recommendation of the Principal Investigator hereby present this certificate to

Sankesh Vithal Shetty

for his/her successful completion of IIT Bombay Research Internship 2022-23 in the following sponsored project undertaken in the Institute.

परियोजना शीर्षक / Project title
Synthesis of layered transition metal oxides for optoelectronicapplications

Given this day, under the seal of the Institute
at Mumbai, in the Republic of India on the 19th day of June, 2023

Principal Investigator                    IITB RI 2022-23 Coordinator                    Dean (R&D)`;

  console.log('📝 Simulated OCR Text:');
  console.log('=' .repeat(80));
  console.log(ocrText);
  console.log('=' .repeat(80));
  console.log();

  try {
    // Test with our server API
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array([0])]), 'iit-certificate.jpg');
    form.append('enableSmartVerification', 'false');
    form.append('rawText', ocrText);
    form.append('ocrConfidence', '0.88');

    const response = await fetch(`${BASE_URL}/api/certificates/ocr`, {
      method: 'POST',
      body: form,
      headers: {
        'x-test-bypass-auth': '1',
        'x-test-bypass-storage': '1'
      }
    });

    if (response.ok) {
      const result = await response.json();
      const ocr = result.data.ocr;
      
      console.log('🎯 EXTRACTION RESULTS:');
      console.log('=' .repeat(80));
      console.log('✅ Title:', ocr.title || '❌ NOT DETECTED');
      console.log('✅ Institution:', ocr.institution || '❌ NOT DETECTED');
      console.log('✅ Date Issued:', ocr.date_issued || '❌ NOT DETECTED');
      console.log('✅ Description:', ocr.description || '❌ NOT DETECTED');
      console.log('📊 Confidence:', ocr.confidence || 'N/A');
      console.log('=' .repeat(80));
      console.log();

      // Analysis
      console.log('📋 ANALYSIS:');
      console.log('=' .repeat(80));
      
      if (!ocr.title || ocr.title === '') {
        console.log('❌ ISSUE: Title not detected');
        console.log('   Expected: "Research Internship" or "IIT Bombay Research Internship"');
        console.log('   Pattern needed: /Research\\s+Internship/i or /IIT.*Internship/i');
      }
      
      if (!ocr.institution || !ocr.institution.toLowerCase().includes('iit')) {
        console.log('❌ ISSUE: Institution not properly detected');
        console.log('   Expected: "Indian Institute of Technology Bombay"');
        console.log('   Pattern needed: Better handling of full institution names');
      }
      
      if (!ocr.date_issued || !ocr.date_issued.includes('2023')) {
        console.log('❌ ISSUE: Date not detected');
        console.log('   Expected: "2023-06-19" or similar');
        console.log('   Pattern needed: /19th.*June.*2023/i');
      }

      console.log('=' .repeat(80));
      
      // Show what should be extracted
      console.log('\n🎯 WHAT SHOULD BE EXTRACTED:');
      console.log('=' .repeat(80));
      console.log('Title: "IIT Bombay Research Internship"');
      console.log('Institution: "Indian Institute of Technology Bombay"');
      console.log('Recipient: "Sankesh Vithal Shetty"');
      console.log('Date: "2023-06-19" (from "19th day of June, 2023")');
      console.log('Project: "Synthesis of layered transition metal oxides for optoelectronicapplications"');
      console.log('Program: "IIT Bombay Research Internship 2022-23"');
      console.log('=' .repeat(80));

    } else {
      console.log('❌ Server Error:', response.status);
      const text = await response.text();
      console.log(text.substring(0, 300) + '...');
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testIITCertificate();
