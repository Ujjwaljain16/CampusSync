#!/usr/bin/env node

// API-backed extractor tests to avoid ts-node dependency

const path = require('path');
require('dotenv').config({ path: path.join(process.cwd(), '.env.local') });
const { createClient } = require('@supabase/supabase-js');

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
const TEST_EMAIL = process.env.TEST_STUDENT_EMAIL || 'student1@university.edu';
const TEST_PASSWORD = process.env.TEST_STUDENT_PASSWORD || 'password123';

function assert(cond, msg) { if (!cond) throw new Error(msg); }

function cookieHeaderFromSetCookies(setCookies) {
  if (!setCookies || setCookies.length === 0) return '';
  const pairs = setCookies.map(sc => sc.split(';')[0]);
  return pairs.join('; ');
}

async function getAuthCookies() {
  // Use bypass header, no cookies needed
  return '';
}

async function extractViaApi(cookieHeader, rawText, confidence = 0.9) {
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array([0])]), 'dummy.jpg');
  form.append('enableSmartVerification', 'false');
  form.append('rawText', rawText);
  form.append('ocrConfidence', String(confidence));
  const res = await fetch(`${BASE_URL}/api/certificates/ocr`, { method: 'POST', body: form, headers: { Cookie: cookieHeader, 'x-test-bypass-auth': '1', 'x-test-bypass-storage': '1' } });
  assert(res.ok, `OCR API failed: ${res.status}`);
  const json = await res.json();
  return json.data.ocr;
}

async function main() {
  console.log('🧪 Running OCR Extractor Tests (API-backed)');
  const cookieHeader = await getAuthCookies();

  const sample1 = 'Certificate of Completion\nThis is to certify that John Doe has successfully completed\non 15/08/2024 from Coursera';
  const ocr1 = await extractViaApi(cookieHeader, sample1, 0.95);
  assert('title' in ocr1, 'title missing');
  assert('institution' in ocr1, 'institution missing');
  assert('date_issued' in ocr1, 'date_issued missing');

  const sample2 = 'Certificate in Machine Learning\nIssued by edX on 2024-07-10';
  const ocr2 = await extractViaApi(cookieHeader, sample2, 0.9);
  assert(ocr2.institution?.toLowerCase().includes('edx'), 'institution should detect edX');

  console.log('✅ OCR extractor API-backed tests passed');
}

main().catch(err => {
  console.error('❌ OCR extractor API-backed tests failed:', err);
  process.exit(1);
});


