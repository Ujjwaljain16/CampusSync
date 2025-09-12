import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '../../../../../lib/supabaseServer';
import { VerificationEngine } from '../../../../../lib/verificationEngine';
import type { OcrExtractionResult } from '../../../../types';

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => null) as { 
      certificateId: string;
      forceVerification?: boolean;
    } | null;

    if (!body || !body.certificateId) {
      return NextResponse.json({ error: 'Missing certificateId' }, { status: 400 });
    }

    // Get certificate details
    const { data: certificate, error: certError } = await supabase
      .from('certificates')
      .select('*')
      .eq('id', body.certificateId)
      .single();

    if (certError || !certificate) {
      return NextResponse.json({ error: 'Certificate not found' }, { status: 404 });
    }

    // Check if already verified
    if (certificate.verification_status === 'verified' && !body.forceVerification) {
      return NextResponse.json({ 
        data: { 
          status: 'already_verified',
          message: 'Certificate is already verified'
        }
      });
    }

    // Download the file for verification
    if (!certificate.file_url) {
      return NextResponse.json({ error: 'No file available for verification' }, { status: 400 });
    }

    const response = await fetch(certificate.file_url);
    if (!response.ok) {
      return NextResponse.json({ error: 'Failed to download file' }, { status: 400 });
    }
    const arrayBuffer = await response.arrayBuffer();
    const fileBuffer = Buffer.from(arrayBuffer);

    // Initialize verification engine
    const verificationEngine = new VerificationEngine();
    await verificationEngine.initialize();

    // Run verification
    const verificationResult = await verificationEngine.verifyCertificate(
      body.certificateId,
      fileBuffer,
      { raw_text: certificate.description || '' } as OcrExtractionResult
    );

    // Make automated decision based on confidence score
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
      .eq('id', body.certificateId);

    if (updateError) {
      console.error('Failed to update certificate status:', updateError);
      return NextResponse.json({ error: 'Failed to update certificate status' }, { status: 500 });
    }

    // Store verification result
    const { error: resultError } = await supabase
      .from('verification_results')
      .insert({
        certificate_id: body.certificateId,
        is_verified: verificationResult.is_verified,
        confidence_score: verificationResult.confidence_score,
        verification_method: verificationResult.verification_method,
        details: verificationResult.details,
        auto_approved: verificationResult.auto_approved,
        requires_manual_review: verificationResult.requires_manual_review,
        created_at: verificationResult.created_at
      });

    if (resultError) {
      console.error('Failed to store verification result:', resultError);
    }

    // If auto-approved, issue verifiable credential
    if (newStatus === 'verified' && decision === 'auto_approved') {
      try {
        const vcResponse = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/certificates/issue`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ certificateId: body.certificateId })
        });
        
        if (!vcResponse.ok) {
          console.error('Failed to issue verifiable credential');
        }
      } catch (error) {
        console.error('Error issuing verifiable credential:', error);
      }
    }

    return NextResponse.json({ 
      data: {
        certificate_id: body.certificateId,
        decision,
        status: newStatus,
        confidence_score: verificationResult.confidence_score,
        verification_method: verificationResult.verification_method,
        message,
        verification_details: verificationResult.details,
        auto_approved: verificationResult.auto_approved,
        requires_manual_review: verificationResult.requires_manual_review
      }
    });

  } catch (error) {
    console.error('Auto-verification error:', error);
    return NextResponse.json({ 
      error: 'Auto-verification failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
