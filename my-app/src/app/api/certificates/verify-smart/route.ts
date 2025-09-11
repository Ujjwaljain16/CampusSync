import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '../../../../../lib/supabaseServer';
import { VerificationEngine } from '../../../../../lib/verificationEngine';
import type { OcrExtractionResult } from '../../../../types';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => null) as { 
      certificateId: string;
      fileUrl?: string;
      ocr?: OcrExtractionResult;
    } | null;

    if (!body || !body.certificateId) {
      return NextResponse.json({ error: 'Missing certificateId' }, { status: 400 });
    }

    // Get certificate details
    const { data: certificate, error: certError } = await supabase
      .from('certificates')
      .select('*')
      .eq('id', body.certificateId)
      .eq('user_id', user.id)
      .single();

    if (certError || !certificate) {
      return NextResponse.json({ error: 'Certificate not found' }, { status: 404 });
    }

    // Download the file for verification
    let fileBuffer: Buffer;
    if (body.fileUrl) {
      const response = await fetch(body.fileUrl);
      if (!response.ok) {
        return NextResponse.json({ error: 'Failed to download file' }, { status: 400 });
      }
      const arrayBuffer = await response.arrayBuffer();
      fileBuffer = Buffer.from(arrayBuffer);
    } else if (certificate.file_url) {
      const response = await fetch(certificate.file_url);
      if (!response.ok) {
        return NextResponse.json({ error: 'Failed to download file' }, { status: 400 });
      }
      const arrayBuffer = await response.arrayBuffer();
      fileBuffer = Buffer.from(arrayBuffer);
    } else {
      return NextResponse.json({ error: 'No file available for verification' }, { status: 400 });
    }

    // Initialize verification engine
    const verificationEngine = new VerificationEngine();
    await verificationEngine.initialize();

    // Run verification
    const verificationResult = await verificationEngine.verifyCertificate(
      body.certificateId,
      fileBuffer,
      body.ocr || { raw_text: certificate.description || '' }
    );

    // Update certificate status based on verification result
    let newStatus = 'pending';
    if (verificationResult.auto_approved) {
      newStatus = 'verified';
    } else if (verificationResult.confidence_score < 0.3) {
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

    return NextResponse.json({ 
      data: {
        verification: verificationResult,
        certificate_status: newStatus
      }
    });

  } catch (error) {
    console.error('Smart verification error:', error);
    return NextResponse.json({ 
      error: 'Verification failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
