import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { VerificationEngine } from '../../../../../lib/verificationEngine';
import type { OcrExtractionResult } from '../../../../types';

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Check if user is faculty or admin
  const { data: userRole } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .single();

  if (!userRole || !['faculty', 'admin'].includes(userRole.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
  }

  try {
    const body = await req.json().catch(() => null) as { 
      certificateIds: string[];
      forceVerification?: boolean;
    } | null;

    if (!body || !body.certificateIds || !Array.isArray(body.certificateIds)) {
      return NextResponse.json({ error: 'Missing or invalid certificateIds array' }, { status: 400 });
    }

    if (body.certificateIds.length === 0) {
      return NextResponse.json({ error: 'No certificates provided' }, { status: 400 });
    }

    if (body.certificateIds.length > 50) {
      return NextResponse.json({ error: 'Maximum 50 certificates allowed per batch' }, { status: 400 });
    }

    // Get all certificates
    const { data: certificates, error: certError } = await supabase
      .from('certificates')
      .select('*')
      .in('id', body.certificateIds);

    if (certError) {
      return NextResponse.json({ error: 'Failed to fetch certificates' }, { status: 500 });
    }

    if (!certificates || certificates.length === 0) {
      return NextResponse.json({ error: 'No certificates found' }, { status: 404 });
    }

    // Initialize verification engine
    const verificationEngine = new VerificationEngine();
    await verificationEngine.initialize();

    const results = [];
    const errors = [];

    // Process each certificate
    for (const certificate of certificates) {
      try {
        // Skip if already verified and not forcing verification
        if (certificate.verification_status === 'verified' && !body.forceVerification) {
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

        // Make automated decision
        let newStatus = 'pending';
        let decision = 'manual_review_required';
        let message = 'Certificate requires manual review';

        if (verificationResult.auto_approved) {
          newStatus = 'verified';
          decision = 'auto_approved';
          message = 'Certificate automatically approved';
        } else if (verificationResult.confidence_score >= 0.90) {
          newStatus = 'verified';
          decision = 'auto_approved';
          message = 'Certificate automatically approved (high confidence)';
        } else if (verificationResult.confidence_score >= 0.70) {
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
        const { error: resultError } = await supabase
          .from('verification_results')
          .insert({
            certificate_id: certificate.id,
            is_verified: verificationResult.is_verified,
            confidence_score: verificationResult.confidence_score,
            verification_method: verificationResult.verification_method,
            details: verificationResult.details,
            auto_approved: verificationResult.auto_approved,
            requires_manual_review: verificationResult.requires_manual_review,
            created_at: verificationResult.created_at
          });

        if (resultError) {
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
          } catch (error) {
            console.error(`Error issuing verifiable credential for certificate ${certificate.id}:`, error);
          }
        }

        results.push({
          certificate_id: certificate.id,
          decision,
          status: newStatus,
          confidence_score: verificationResult.confidence_score,
          verification_method: verificationResult.verification_method,
          message,
          auto_approved: verificationResult.auto_approved,
          requires_manual_review: verificationResult.requires_manual_review
        });

      } catch (error) {
        errors.push({
          certificate_id: certificate.id,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    return NextResponse.json({ 
      data: {
        total_processed: certificates.length,
        successful: results.length,
        failed: errors.length,
        results,
        errors
      }
    });

  } catch (error) {
    console.error('Bulk verification error:', error);
    return NextResponse.json({ 
      error: 'Bulk verification failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

