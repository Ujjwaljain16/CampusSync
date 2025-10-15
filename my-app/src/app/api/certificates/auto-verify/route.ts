import { NextRequest } from 'next/server';
import { withAuth, success, apiError, parseAndValidateBody } from '@/lib/api';
import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { VerificationEngine } from '../../../../../lib/verificationEngine';
import { emailService } from '../../../../../lib/emailService';
import type { OcrExtractionResult } from '../../../../types';

interface AutoVerifyBody {
  certificateId: string;
  forceVerification?: boolean;
}

export const POST = withAuth(async (req: NextRequest) => {
  const result = await parseAndValidateBody<AutoVerifyBody>(req, ['certificateId']);
  if (result.error) return result.error;

  const { certificateId, forceVerification } = result.data;
  const supabase = await createSupabaseServerClient();

  // Get certificate details
  const { data: certificate, error: certError } = await supabase
    .from('certificates')
    .select('*')
    .eq('id', certificateId)
    .single();

  if (certError || !certificate) {
    throw apiError.notFound('Certificate not found');
  }

  // Check if already verified
  if (certificate.verification_status === 'verified' && !forceVerification) {
    return success({ 
      status: 'already_verified',
      message: 'Certificate is already verified'
    });
  }

  // Download the file for verification
  if (!certificate.file_url) {
    throw apiError.badRequest('No file available for verification');
  }

  const response = await fetch(certificate.file_url);
  if (!response.ok) {
    throw apiError.badRequest('Failed to download file');
  }
  const arrayBuffer = await response.arrayBuffer();
  const fileBuffer = Buffer.from(arrayBuffer);

  // Initialize verification engine
  const verificationEngine = new VerificationEngine();
  await verificationEngine.initialize();

  // Run verification
  const verificationResult = await verificationEngine.verifyCertificate(
    certificateId,
    fileBuffer,
    { raw_text: certificate.description || '' } as OcrExtractionResult
  );

  // Make automated decision based on confidence score
  let newStatus = 'pending';
  let decision = 'manual_review_required';
  let message = 'Certificate requires manual review';

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

  const confidenceScore = vr.confidence_score || 0;

  if (vr.auto_approved) {
    newStatus = 'verified';
    decision = 'auto_approved';
    message = 'Certificate automatically approved';
  } else if (confidenceScore >= 0.90) {
    newStatus = 'verified';
    decision = 'auto_approved';
    message = 'Certificate automatically approved (high confidence)';
  } else if (confidenceScore >= 0.70) {
    newStatus = 'pending';
    decision = 'manual_review_required';
    message = 'Certificate requires manual review (medium confidence)';
  } else {
    newStatus = 'rejected';
    decision = 'auto_rejected';
    message = 'Certificate automatically rejected (low confidence)';
  }

  // Update certificate status
  const { error: updateError } = await supabase
    .from('certificates')
    .update({ 
      verification_status: newStatus,
      updated_at: new Date().toISOString()
    })
    .eq('id', certificateId);

  if (updateError) {
    console.error('Failed to update certificate status:', updateError);
    throw apiError.internal('Failed to update certificate status');
  }

  // Store verification result
  try {
    await supabase.from('verification_results').insert({
      certificate_id: certificateId,
      is_verified: vr.is_verified || vr.verified,
      confidence_score: vr.confidence_score,
      verification_method: vr.verification_method,
      details: vr.details,
      auto_approved: vr.auto_approved,
      requires_manual_review: vr.requires_manual_review,
      created_at: vr.created_at
    });
  } catch (resultError) {
    console.error('Failed to store verification result:', resultError);
  }

  // If auto-approved, issue verifiable credential
  if (newStatus === 'verified' && decision === 'auto_approved') {
    try {
      const vcResponse = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/certificates/issue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ certificateId })
      });
      
      if (!vcResponse.ok) {
        console.error('Failed to issue verifiable credential');
      }
    } catch (error) {
      console.error('Error issuing verifiable credential:', error);
    }
  }

  // Send email notification for auto-approval or manual review requirement
  try {
    const { data: userData } = await supabase.auth.admin.getUserById(certificate.user_id);
    const userEmail = userData?.user?.email;

    if (userEmail) {
      const notificationData = {
        studentName: userData?.user?.user_metadata?.full_name || 'Student',
        certificateTitle: certificate.title,
        institution: certificate.institution,
        confidenceScore: vr.confidence_score,
        verificationMethod: vr.verification_method,
        portfolioUrl: `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/public/portfolio/${certificate.user_id}`,
      };

      if (decision === 'auto_approved') {
        await emailService.sendCertificateAutoApproved(userEmail, notificationData);
      } else if (decision === 'manual_review_required') {
        await emailService.sendManualReviewRequired(userEmail, notificationData);
      }
    }
  } catch (emailError) {
    console.error('Failed to send email notification:', emailError);
    // Don't fail the request if email fails
  }

  return success({
    certificate_id: certificateId,
    decision,
    status: newStatus,
    confidence_score: vr.confidence_score,
    verification_method: vr.verification_method,
    message,
    verification_details: vr.details,
    auto_approved: vr.auto_approved,
    requires_manual_review: vr.requires_manual_review
  }, message);
});

