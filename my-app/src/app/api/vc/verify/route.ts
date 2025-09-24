import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient, requireRole } from '../../../../../lib/supabaseServer';
import { ProductionVCVerifier, type VerificationOptions } from '../../../../../lib/vc/vcVerifier';
import { ProductionKeyManager } from '../../../../../lib/vc/productionKeyManager';
import type { VerifiableCredential } from '../../../../types';

export async function POST(req: NextRequest) {
  try {
    const auth = await requireRole(['student', 'faculty', 'admin', 'recruiter']);
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.message }, { status: auth.status });
    }

    const body = await req.json().catch(() => null) as {
      credential: VerifiableCredential;
      options?: VerificationOptions;
    } | null;

    if (!body || !body.credential) {
      return NextResponse.json({ 
        error: 'Missing required field: credential' 
      }, { status: 400 });
    }

    // Initialize VC verifier
    const vcVerifier = ProductionVCVerifier.getInstance();
    
    // Get trusted keys
    const keyManager = ProductionKeyManager.getInstance();
    const currentKey = keyManager.getCurrentKey();
    
    if (currentKey) {
      vcVerifier.addTrustedKey(currentKey.kid, currentKey);
    }

    // Set default verification options
    const verificationOptions: VerificationOptions = {
      allowExpired: false,
      strictMode: true,
      checkRevocation: true,
      allowedIssuers: [process.env.NEXT_PUBLIC_ISSUER_DID || 'did:web:localhost:3000'],
      ...body.options
    };

    // Verify the credential
    const result = await vcVerifier.verifyCredential(
      body.credential,
      verificationOptions,
      auth.user?.id || 'anonymous'
    );

    // Store verification result in database
    const supabase = await createSupabaseServerClient();
    await supabase.from('audit_logs').insert({
      user_id: auth.user?.id || null,
      action: 'verify_vc',
      target_id: body.credential.id,
      details: {
        isValid: result.isValid,
        errors: result.errors,
        warnings: result.warnings,
        verificationMethod: 'JsonWebSignature2020',
        issuer: result.metadata.issuer,
        subject: result.metadata.subject
      },
      created_at: new Date().toISOString(),
    });

    return NextResponse.json({
      data: {
        isValid: result.isValid,
        credential: result.credential,
        errors: result.errors,
        warnings: result.warnings,
        metadata: result.metadata,
        revocationStatus: result.revocationStatus,
        validationDetails: result.validationDetails
      }
    });

  } catch (error: any) {
    console.error('VC verification error:', error);
    return NextResponse.json({ 
      error: error.message || 'Internal server error' 
    }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireRole(['faculty', 'admin']);
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.message }, { status: auth.status });
    }

    const vcVerifier = ProductionVCVerifier.getInstance();
    const stats = vcVerifier.getVerificationStats();

    return NextResponse.json({
      data: stats
    });

  } catch (error: any) {
    console.error('VC verification stats error:', error);
    return NextResponse.json({ 
      error: error.message || 'Internal server error' 
    }, { status: 500 });
  }
}
