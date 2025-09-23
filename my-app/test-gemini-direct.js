// Direct Gemini API Test
require('dotenv').config({ path: '.env.local' });

const sampleText = `
INDIAN INSTITUTE OF TECHNOLOGY BOMBAY
SPONSORED RESEARCH PROJECT

This is to certify that

Sankesh Vithal Shetty

has successfully completed his/her summer research internship under the sponsored project "Structural Health Monitoring of Bridges Using IoT and Machine Learning" under the supervision of Prof. Rajesh Kumar, Department of Civil Engineering, IIT Bombay.

The internship was completed during the period from 1st June 2023 to 19th June 2023.

Given this 19th day of June, 2023
Under the seal of the Institute
`;

async function testGeminiDirect() {
  console.log('🧪 Testing Gemini 2.5 Flash API directly...\n');
  
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('❌ GEMINI_API_KEY not found in environment');
    return;
  }
  
  console.log('✅ API Key found:', apiKey.substring(0, 10) + '...');
  
  const prompt = `You are an expert at extracting structured information from certificate OCR text. Extract the following information and return ONLY a valid JSON object:

{
  "title": "exact course/program/certificate name (not recipient name)",
  "institution": "issuing organization/university/company",
  "recipient": "student/recipient full name", 
  "date_issued": "YYYY-MM-DD format",
  "certificate_id": "any certificate ID/serial number found",
  "description": "brief 1-2 line description of achievement"
}

CRITICAL RULES:
- Return ONLY the JSON object, no markdown, no explanation, no extra text
- title should be the course/program name, NOT the person's name
- recipient should be the person's name, NOT the course name
- Convert all dates to YYYY-MM-DD format (e.g., "June 19, 2023" → "2023-06-19")
- Use null for any missing fields
- Fix common OCR errors (e.g., "IT Bombay" → "IIT Bombay", "nership" → "nternship")
- For IIT certificates, title should include "IIT Bombay Research Internship" format

OCR Text:
${sampleText}`;

  try {
    console.log('🚀 Calling Gemini API...');
    
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: prompt
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 500,
        }
      })
    });

    console.log('📡 Response status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ API Error:', errorText);
      return;
    }

    const data = await response.json();
    console.log('📦 Raw API Response:', JSON.stringify(data, null, 2));
    
    if (data.error) {
      console.error('❌ Gemini API error:', data.error.message);
      return;
    }
    
    if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
      console.error('❌ Invalid response structure');
      return;
    }
    
    const responseText = data.candidates[0].content.parts[0].text;
    console.log('\n🎯 Gemini Response Text:');
    console.log(responseText);
    
    try {
      const parsed = JSON.parse(responseText);
      console.log('\n✅ Parsed JSON:');
      console.log(JSON.stringify(parsed, null, 2));
      
      // Validate results
      console.log('\n🔍 Validation:');
      console.log('✅ Title:', parsed.title);
      console.log('✅ Institution:', parsed.institution);
      console.log('✅ Recipient:', parsed.recipient);
      console.log('✅ Date:', parsed.date_issued);
      
      if (parsed.title && parsed.title.toLowerCase().includes('internship')) {
        console.log('🎉 SUCCESS: Gemini correctly identified the internship title!');
      }
      
      if (parsed.date_issued === '2023-06-19') {
        console.log('🎉 SUCCESS: Gemini correctly parsed the date!');
      }
      
    } catch (parseError) {
      console.error('❌ Failed to parse Gemini response as JSON:', parseError.message);
      console.log('Raw response:', responseText);
    }
    
  } catch (error) {
    console.error('❌ Network/API error:', error.message);
  }
}

testGeminiDirect();
