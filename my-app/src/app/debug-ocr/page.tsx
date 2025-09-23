'use client';

import React, { useState } from 'react';

export default function DebugOCRPage() {
  const [result, setResult] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const testOCRAPI = async () => {
    setLoading(true);
    setResult('Testing OCR API...\n');
    
    try {
      // Test the same OCR text from our IIT certificate
      const ocrText = `INDIAN INSTITUTE OF TECHNOLOGY BOMBAY

upon recommendation of the Principal Investigator hereby present this certificate to

Sankesh Vithal Shetty

for his/her successful completion of IIT Bombay Research Internship 2022-23 in the following sponsored project undertaken in the Institute.

परियोजना शीर्षक / Project title
Synthesis of layered transition metal oxides for optoelectronicapplications

Given this day, under the seal of the Institute
at Mumbai, in the Republic of India on the 19th day of June, 2023

Principal Investigator                    IITB RI 2022-23 Coordinator                    Dean (R&D)`;

      const formData = new FormData();
      formData.append('file', new Blob([new Uint8Array(100)]), 'test-certificate.jpg');
      formData.append('enableSmartVerification', 'false'); // Disable to avoid complexity
      formData.append('rawText', ocrText);
      formData.append('ocrConfidence', '0.88');

      setResult(prev => prev + 'Making API request...\n');

      const response = await fetch('/api/certificates/ocr', {
        method: 'POST',
        body: formData,
      });

      setResult(prev => prev + `Response status: ${response.status}\n`);

      if (!response.ok) {
        const errorText = await response.text();
        setResult(prev => prev + `❌ Error: ${errorText}\n`);
        return;
      }

      const data = await response.json();
      setResult(prev => prev + '\n✅ SUCCESS! OCR Data:\n');
      setResult(prev => prev + `Title: "${data.data.ocr.title}"\n`);
      setResult(prev => prev + `Institution: "${data.data.ocr.institution}"\n`);
      setResult(prev => prev + `Recipient: "${data.data.ocr.recipient}"\n`);
      setResult(prev => prev + `Date: "${data.data.ocr.date_issued}"\n`);
      setResult(prev => prev + `Description: "${data.data.ocr.description?.substring(0, 50)}..."\n`);
      setResult(prev => prev + `Confidence: ${data.data.ocr.confidence}\n`);
      
      setResult(prev => prev + '\n🎯 FRONTEND SIMULATION:\n');
      const frontendOcr = {
        title: data.data.ocr.title || 'Untitled Certificate',
        institution: data.data.ocr.institution || '',
        date_issued: data.data.ocr.date_issued || new Date().toISOString().split('T')[0],
        description: data.data.ocr.description || data.data.ocr.raw_text || '',
      };
      
      setResult(prev => prev + `Form would show:\n`);
      setResult(prev => prev + `- Title: "${frontendOcr.title}"\n`);
      setResult(prev => prev + `- Institution: "${frontendOcr.institution}"\n`);
      setResult(prev => prev + `- Date: "${frontendOcr.date_issued}"\n`);
      setResult(prev => prev + `- Description: "${frontendOcr.description?.substring(0, 50)}..."\n`);

    } catch (error) {
      setResult(prev => prev + `❌ Exception: ${error}\n`);
    } finally {
      setLoading(false);
    }
  };

  const testMineAPI = async () => {
    setLoading(true);
    setResult('Testing /mine API for comparison...\n');
    
    try {
      const response = await fetch('/api/certificates/mine');
      setResult(prev => prev + `Mine API status: ${response.status}\n`);
      
      if (response.ok) {
        const data = await response.json();
        setResult(prev => prev + `✅ Mine API works! Found ${data.data?.length || 0} certificates\n`);
      } else {
        const errorText = await response.text();
        setResult(prev => prev + `❌ Mine API failed: ${errorText}\n`);
      }
    } catch (error) {
      setResult(prev => prev + `❌ Mine API exception: ${error}\n`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white/10 backdrop-blur-lg rounded-3xl p-8 border border-white/20">
          <h1 className="text-3xl font-bold text-white mb-8">🔍 OCR Debug Tool</h1>
          
          <div className="space-y-4 mb-8">
            <button
              onClick={testMineAPI}
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-6 py-3 rounded-xl font-medium transition-colors"
            >
              {loading ? 'Testing...' : 'Test /mine API (should work)'}
            </button>
            
            <button
              onClick={testOCRAPI}
              disabled={loading}
              className="bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white px-6 py-3 rounded-xl font-medium transition-colors ml-4"
            >
              {loading ? 'Testing...' : 'Test OCR API (the problem)'}
            </button>
          </div>

          <div className="bg-black/30 rounded-xl p-6 min-h-[400px]">
            <h2 className="text-white text-lg font-semibold mb-4">Results:</h2>
            <pre className="text-green-300 font-mono text-sm whitespace-pre-wrap overflow-auto">
              {result || 'Click a button above to start testing...'}
            </pre>
          </div>

          <div className="mt-6 text-white/70 text-sm">
            <p><strong>How to use:</strong></p>
            <ol className="list-decimal list-inside space-y-1 mt-2">
              <li>First click "Test /mine API" to verify your authentication is working</li>
              <li>Then click "Test OCR API" to see what happens with the actual OCR call</li>
              <li>Compare the results to identify the issue</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
