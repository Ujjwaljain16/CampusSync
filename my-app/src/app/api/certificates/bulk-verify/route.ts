import { NextRequest } from 'next/server';
import { withRole, success, apiError, parseAndValidateBody } from '@/lib/api';
import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { VerificationEngine } from '../../../../../lib/verificationEngine';
import type { OcrExtractionResult } from '../../../../types';

interface BulkVerifyBody {
  certificateIds: string[];
  forceVerification?: boolean;
}

export const POST = withRole(['faculty', 'admin'], async (req: NextRequest) => {
  const result = await parseAndValidateBody<BulkVerifyBody>(req, ['certificateIds']);
  if (result.error) return result.error;

  const { certificateIds, forceVerification } = result.data;

  if (!Array.isArray(certificateIds)) {
    throw apiError.badRequest('certificateIds must be an array');
  }

  if (certificateIds.length === 0) {
    throw apiError.badRequest('No certificates provided');
  }

  if (certificateIds.length > 50) {
    throw apiError.badRequest('Maximum 50 certificates allowed per batch');
  }

  const supabase = await createSupabaseServerClient();

  // Get all certificates
  const { data: certificates, error: certError } = await supabase
    .from('certificates')
    .select('*')
    .in('id', certificateIds);

  if (certError) {
    console.error('Error fetching certificates:', certError);
    throw apiError.internal('Failed to fetch certificates');
  }

  if (!certificates || certificates.length === 0) {
    throw apiError.notFound('No certificates found');
  }

  // Initialize verification engine
  const verificationEngine = new VerificationEngine();
  await verificationEngine.initialize();

  const results: Array<Record<string, unknown>> = [];
  const errors: Array<Record<string, unknown>> = [];

  // Process each certificate
  for (const certificate of certificates) {
    try {
      // Skip if already verified and not forcing verification
      if (certificate.verification_status === 'verified' && !forceVerification) {
        results.push({
          certificate_id: certificate.id,
          status: 'skipped',
          message: 'Already verified'
        });
        continue;
      }

      // Download the file for verification
      if (!certificate.file_url) {
        errors.push({
          certificate_id: certificate.id,
          error: 'No file available for verification'
        });
        continue;
      }

      const response = await fetch(certificate.file_url);
      if (!response.ok) {
        errors.push({
          certificate_id: certificate.id,
          error: 'Failed to download file'
        });
        continue;
      }
      const arrayBuffer = await response.arrayBuffer();
      const fileBuffer = Buffer.from(arrayBuffer);

      // Run verification
      const verificationResult = await verificationEngine.verifyCertificate(
        certificate.id,
        fileBuffer,
        { raw_text: certificate.description || '' } as OcrExtractionResult
      );

      // Type workaround for dynamic properties
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

      // Make automated decision
      let newStatus = 'pending';
      let decision = 'manual_review_required';
      let message = 'Certificate requires manual review';
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
        .eq('id', certificate.id);

      if (updateError) {
        errors.push({
          certificate_id: certificate.id,
          error: 'Failed to update certificate status'
        });
        continue;
      }

      // Store verification result
      try {
        await supabase.from('verification_results').insert({
          certificate_id: certificate.id,
          is_verified: vr.is_verified || vr.verified,
          confidence_score: vr.confidence_score,
          verification_method: vr.verification_method,
          details: vr.details,
          auto_approved: vr.auto_approved,
          requires_manual_review: vr.requires_manual_review,
          created_at: vr.created_at
        });
      } catch (resultError) {
        console.error(`Failed to store verification result for certificate ${certificate.id}:`, resultError);
      }

      // If auto-approved, issue verifiable credential
      if (newStatus === 'verified' && decision === 'auto_approved') {
        try {
          const vcResponse = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/certificates/issue`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ certificateId: certificate.id })
          });
          
          if (!vcResponse.ok) {
            console.error(`Failed to issue verifiable credential for certificate ${certificate.id}`);
          }
        } catch (vcError) {
          console.error(`Error issuing verifiable credential for certificate ${certificate.id}:`, vcError);
        }
      }

      results.push({
        certificate_id: certificate.id,
        decision,
        status: newStatus,
        confidence_score: vr.confidence_score,
        verification_method: vr.verification_method,
        message,
        auto_approved: vr.auto_approved,
        requires_manual_review: vr.requires_manual_review
      });

    } catch (processingError) {
      errors.push({
        certificate_id: certificate.id,
        error: processingError instanceof Error ? processingError.message : 'Unknown error'
      });
    }
  }

  return success({
    total_processed: certificates.length,
    successful: results.length,
    failed: errors.length,
    results,
    errors
  });
});

