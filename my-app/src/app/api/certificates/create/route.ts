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
  
  const user: User = authUser;

  const body = await req.json().catch(() => null) as CreateCertificateBody | null;
  
  if (!body || !body.publicUrl) {
    throw apiError.badRequest('Invalid payload: publicUrl is required');
  }

  // The file must be one the caller uploaded to our own storage (path is scoped by user id)
  const storagePrefix = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/`;
  if (typeof body.publicUrl !== 'string' || !body.publicUrl.startsWith(storagePrefix) || !body.publicUrl.includes(`/${user.id}/`)) {
    throw apiError.badRequest('Invalid file URL');
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

  const { error } = await supabase.from('certificates').insert(certificateData);

  if (error) {
    console.error('Certificate creation error:', error);
    throw apiError.internal('Failed to create certificate');
  }

  return success({ status: 'created' }, 'Certificate created successfully', 201);
});



