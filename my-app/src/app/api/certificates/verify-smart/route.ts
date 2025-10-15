import { NextRequest } from 'next/server';
import { withAuth, success, apiError, parseAndValidateBody } from '@/lib/api';
import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { VerificationEngine } from '../../../../../lib/verificationEngine';
import type { OcrExtractionResult } from '../../../../types';

export const runtime = 'nodejs';

interface VerifySmartBody {
  certificateId: string;
  fileUrl?: string;
  ocr?: OcrExtractionResult;
}

export const POST = withAuth(async (req: NextRequest, { user }) => {
  const result = await parseAndValidateBody<VerifySmartBody>(req, ['certificateId']);
  if (result.error) return result.error;

  const body = result.data;
  const supabase = await createSupabaseServerClient();

  // Get certificate details
  const { data: certificate, error: certError } = await supabase
    .from('certificates')
    .select('*')
    .eq('id', body.certificateId)
    .eq('user_id', user.id)
    .single();

  if (certError || !certificate) {
    throw apiError.notFound('Certificate not found');
  }

  // Download the file for verification
  let fileBuffer: Buffer;
  if (body.fileUrl) {
    const response = await fetch(body.fileUrl);
    if (!response.ok) {
      throw apiError.badRequest('Failed to download file');
    }
    const arrayBuffer = await response.arrayBuffer();
    fileBuffer = Buffer.from(arrayBuffer);
  } else if (certificate.file_url) {
    const response = await fetch(certificate.file_url);
    if (!response.ok) {
      throw apiError.badRequest('Failed to download file');
    }
    const arrayBuffer = await response.arrayBuffer();
    fileBuffer = Buffer.from(arrayBuffer);
  } else {
    throw apiError.badRequest('No file available for verification');
  }

  // Initialize verification engine
  const verificationEngine = new VerificationEngine();
  await verificationEngine.initialize();

  // Run verification
  const verificationResult = await verificationEngine.verifyCertificate(
    body.certificateId,
    fileBuffer,
    body.ocr || { 
      raw_text: certificate.description || '', 
      confidence: 0,
      extracted_fields: {}
    } as OcrExtractionResult
  );

  const vr = verificationResult as unknown as {
    auto_approved?: boolean;
    confidence_score?: number;
    is_verified?: boolean;
    verified?: boolean;
    verification_method?: string;
    details?: unknown;
    requires_manual_review?: boolean;
    created_at?: string;
  };

  // Update certificate status based on verification result
  let newStatus = 'pending';
  if (vr.auto_approved) {
    newStatus = 'verified';
  } else if ((vr.confidence_score || 0) < 0.3) {
    newStatus = 'rejected';
  }

  // Update certificate in database
  const { error: updateError } = await supabase
    .from('certificates')
    .update({ 
      verification_status: newStatus,
      updated_at: new Date().toISOString()
    })
    .eq('id', body.certificateId);

  if (updateError) {
    console.error('Failed to update certificate status:', updateError);
  }

  // Store verification result
  const { error: resultError } = await supabase
    .from('verification_results')
    .insert({
      certificate_id: body.certificateId,
      is_verified: vr.is_verified || vr.verified,
      confidence_score: vr.confidence_score,
      verification_method: vr.verification_method,
      details: vr.details,
      auto_approved: vr.auto_approved,
      requires_manual_review: vr.requires_manual_review,
      created_at: vr.created_at
    });

  if (resultError) {
    console.error('Failed to store verification result:', resultError);
  }

  return success({
    verification: verificationResult,
    certificate_status: newStatus
  });
});

