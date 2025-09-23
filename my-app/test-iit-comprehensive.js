#!/usr/bin/env node

const BASE_URL = 'http://localhost:3000';

async function testIITCertificateComprehensive() {
  console.log('🧪 COMPREHENSIVE IIT Bombay Certificate Test\n');
  
  const ocrText = `INDIAN INSTITUTE OF TECHNOLOGY BOMBAY

upon recommendation of the Principal Investigator hereby present this certificate to

Sankesh Vithal Shetty

for his/her successful completion of IIT Bombay Research Internship 2022-23 in the following sponsored project undertaken in the Institute.

परियोजना शीर्षक / Project title
Synthesis of layered transition metal oxides for optoelectronicapplications

Given this day, under the seal of the Institute
at Mumbai, in the Republic of India on the 19th day of June, 2023

Principal Investigator                    IITB RI 2022-23 Coordinator                    Dean (R&D)`;

  try {
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array([0])]), 'iit-certificate.jpg');
    form.append('enableSmartVerification', 'false');
    form.append('rawText', ocrText);
    form.append('ocrConfidence', '0.92');

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
      console.log('Title:', ocr.title || '❌ MISSING');
      console.log('Institution:', ocr.institution || '❌ MISSING');
      console.log('Recipient:', ocr.recipient || '❌ MISSING');
      console.log('Date Issued:', ocr.date_issued || '❌ MISSING');
      console.log('Description:', ocr.description || '❌ MISSING');
      console.log('Confidence:', ocr.confidence || 'N/A');
      console.log('=' .repeat(80));
      console.log();

      // Validate each field
      const validations = [];
      
      if (ocr.title && ocr.title.toLowerCase().includes('research internship')) {
        validations.push('✅ Title: Correctly detected research internship');
      } else {
        validations.push('❌ Title: Missing or incorrect');
      }
      
      if (ocr.institution && ocr.institution.toLowerCase().includes('indian institute')) {
        validations.push('✅ Institution: Correctly detected IIT Bombay');
      } else {
        validations.push('❌ Institution: Missing or incomplete');
      }
      
      if (ocr.recipient && ocr.recipient.includes('Sankesh')) {
        validations.push('✅ Recipient: Correctly detected name');
      } else {
        validations.push('❌ Recipient: Missing or incorrect');
      }
      
      if (ocr.date_issued && ocr.date_issued.includes('2023')) {
        validations.push('✅ Date: Correctly detected 2023');
      } else {
        validations.push('❌ Date: Missing or incorrect');
      }
      
      if (ocr.description && ocr.description.toLowerCase().includes('internship')) {
        validations.push('✅ Description: Contains relevant content');
      } else {
        validations.push('❌ Description: Missing or inadequate');
      }

      console.log('📋 VALIDATION RESULTS:');
      console.log('=' .repeat(80));
      validations.forEach(v => console.log(v));
      console.log('=' .repeat(80));
      console.log();

      const passCount = validations.filter(v => v.startsWith('✅')).length;
      const totalCount = validations.length;
      
      console.log(`🏆 OVERALL SCORE: ${passCount}/${totalCount} (${Math.round(passCount/totalCount*100)}%)`);
      
      if (passCount === totalCount) {
        console.log('🎉 PERFECT EXTRACTION! All fields correctly detected.');
      } else if (passCount >= totalCount * 0.8) {
        console.log('👍 GOOD EXTRACTION! Most fields correctly detected.');
      } else {
        console.log('⚠️  NEEDS IMPROVEMENT! Several fields missing or incorrect.');
      }

      // Test what the user would see in the UI
      console.log('\n👤 USER EXPERIENCE PREVIEW:');
      console.log('=' .repeat(80));
      console.log('When uploading this certificate, the user would see:');
      console.log(`📋 Title: "${ocr.title || '[Please enter manually]'}"`);
      console.log(`🏢 Institution: "${ocr.institution || '[Please enter manually]'}"`);
      console.log(`👤 Recipient: "${ocr.recipient || '[Please enter manually]'}"`);
      console.log(`📅 Date: "${ocr.date_issued || '[Please enter manually]'}"`);
      console.log(`📝 Description: "${ocr.description || '[Please enter manually]'}"`);
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

testIITCertificateComprehensive();
