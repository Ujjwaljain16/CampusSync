#!/usr/bin/env node

// API-level test: send rawText to OCR endpoint and assert extracted fields

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
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const supabase = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } });
  const { data, error } = await supabase.auth.signInWithPassword({ email: TEST_EMAIL, password: TEST_PASSWORD });
  assert(!error && data.session, `Sign-in failed: ${error?.message}`);
  const tokens = { access_token: data.session.access_token, refresh_token: data.session.refresh_token };
  const res = await fetch(`${BASE_URL}/api/auth/set-session`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(tokens) });
  assert(res.ok, `set-session failed: ${res.status}`);
  const setCookies = res.headers.getSetCookie ? res.headers.getSetCookie() : (res.headers.raw ? res.headers.raw()['set-cookie'] : []);
  const cookieHeader = cookieHeaderFromSetCookies(setCookies || []);
  assert(cookieHeader, 'No auth cookies received');
  return cookieHeader;
}

async function main() {
  console.log('🧪 Running OCR Extractor API Test');
  const cookieHeader = '';

  const rawText = `Certificate of Achievement\nThis is to certify that Alice Smith has completed Data Structures on 2024-07-10 by edX`;
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array([0])]), 'dummy.jpg');
  form.append('enableSmartVerification', 'false');
  form.append('rawText', rawText);
  form.append('ocrConfidence', '0.92');

  const res = await fetch(`${BASE_URL}/api/certificates/ocr`, { method: 'POST', body: form, headers: { Cookie: cookieHeader, 'x-test-bypass-auth': '1', 'x-test-bypass-storage': '1' } });
  assert(res.ok, `OCR API failed: ${res.status}`);
  const json = await res.json();

  const ocr = json?.data?.ocr || {};
  assert(ocr.title !== undefined, 'title missing');
  assert(ocr.institution?.toLowerCase().includes('edx'), 'institution should include edX');
  assert(ocr.date_issued, 'date_issued missing');
  assert(json?.data?.publicUrl, 'publicUrl missing');

  console.log('✅ OCR API extraction test passed');
}

main().catch(err => {
  console.error('❌ OCR API extraction test failed:', err);
  process.exit(1);
});


