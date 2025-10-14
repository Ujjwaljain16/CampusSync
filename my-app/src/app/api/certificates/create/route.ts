import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabaseServer';
import type { OcrExtractionResult } from '../../../../types';

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const admin = createSupabaseAdminClient();
  let { data: { user } } = await supabase.auth.getUser();
  if (!user && process.env.NODE_ENV !== 'production' && req.headers.get('x-test-bypass-auth') === '1') {
    user = { id: process.env.TEST_STUDENT_USER_ID || 'test-user' } as any;
  }
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null) as { filePath?: string; publicUrl?: string; ocr?: OcrExtractionResult } | null;
  const bypassStorage = process.env.NODE_ENV !== 'production' && req.headers.get('x-test-bypass-storage') === '1';
  if (!body || (!bypassStorage && !body.publicUrl)) return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });

  if (bypassStorage) {
    // Skip database operations in test bypass mode
    return NextResponse.json({ data: { status: 'created' } });
  }

  const now = new Date().toISOString();
  
  const certificateData = {
    user_id: user.id,
    student_id: user.id,
    title: body.ocr?.title ?? 'Untitled Certificate',
    institution: body.ocr?.institution ?? '',
    date_issued: body.ocr?.date_issued ?? now,
    description: body.ocr?.description ?? body.ocr?.raw_text ?? '',
    file_url: body.publicUrl,
    verification_status: 'pending' as const,
    created_at: now,
    updated_at: now,
  };

  console.log('Inserting certificate with data:', certificateData);
  
  const { error } = await supabase.from('certificates').insert(certificateData);

  if (error) {
    console.error('Certificate creation error:', error);
    console.error('Certificate data that failed:', certificateData);
    return NextResponse.json({ 
      error: error.message, 
      details: error.details,
      hint: error.hint,
      code: error.code
    }, { status: 500 });
  }

  return NextResponse.json({ data: { status: 'created' } });
}



