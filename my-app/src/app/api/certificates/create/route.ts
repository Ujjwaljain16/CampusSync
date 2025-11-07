import { NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { withAuth, success, apiError } from '@/lib/api';
import type { OcrExtractionResult } from '../../../../types';
import type { User } from '@supabase/supabase-js';

interface CreateCertificateBody {
  filePath?: string;
  publicUrl?: string;
  ocr?: OcrExtractionResult;
}

export const POST = withAuth(async (req: NextRequest, { user: authUser }) => {
  const supabase = await createSupabaseServerClient();
  
  // Handle test bypass for non-production environments
  let user: User = authUser;
  if (process.env.NODE_ENV !== 'production' && req.headers.get('x-test-bypass-auth') === '1') {
    user = { id: process.env.TEST_STUDENT_USER_ID || 'test-user' } as User;
  }

  const body = await req.json().catch(() => null) as CreateCertificateBody | null;
  const bypassStorage = process.env.NODE_ENV !== 'production' && req.headers.get('x-test-bypass-storage') === '1';
  
  if (!body || (!bypassStorage && !body.publicUrl)) {
    throw apiError.badRequest('Invalid payload: publicUrl is required');
  }

  // Skip database operations in test bypass mode
  if (bypassStorage) {
    return success({ status: 'created' }, 'Certificate created (test bypass mode)');
  }

  // Get user's organization_id from their profile
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', user.id)
    .single();

  if (profileError || !profile?.organization_id) {
    throw apiError.badRequest('User profile not found or organization not set. Please complete your profile first.');
  }

  const now = new Date().toISOString();
  
  const certificateData = {
    student_id: user.id,
    organization_id: profile.organization_id,
    title: body.ocr?.title ?? 'Untitled Certificate',
    institution: body.ocr?.institution ?? '',
    date_issued: body.ocr?.date_issued ?? now,
    description: body.ocr?.description ?? body.ocr?.raw_text ?? '',
    file_url: body.publicUrl,
    verification_status: 'pending' as const,
    confidence_score: body.ocr?.confidence ?? null,
    created_at: now,
    updated_at: now,
  };

  console.log('Inserting certificate with data:', certificateData);
  
  const { error } = await supabase.from('certificates').insert(certificateData);

  if (error) {
    console.error('Certificate creation error:', error);
    console.error('Certificate data that failed:', certificateData);
    throw apiError.internal(error.message, {
      details: error.details,
      hint: error.hint,
      code: error.code
    });
  }

  return success({ status: 'created' }, 'Certificate created successfully', 201);
});



