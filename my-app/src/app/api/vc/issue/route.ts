import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient, requireRole, getServerUserWithRole } from '../../../../../lib/supabaseServer';
import { ProductionVCIssuer, type IssuanceRequest } from '../../../../../lib/vc/vcIssuer';
import { ProductionKeyManager } from '../../../../../lib/vc/productionKeyManager';
import type { CredentialSubject } from '../../../../types';

export async function POST(req: NextRequest) {
  try {
    const auth = await requireRole(['faculty', 'admin']);
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.message }, { status: auth.status });
    }

    const body = await req.json().catch(() => null) as {
      credentialSubject: CredentialSubject;
      credentialType: string;
      validityPeriod?: number;
      customFields?: Record<string, any>;
      metadata?: Record<string, any>;
    } | null;

    if (!body || !body.credentialSubject || !body.credentialType) {
      return NextResponse.json({ 
        error: 'Missing required fields: credentialSubject, credentialType' 
      }, { status: 400 });
    }

    const { user } = await getServerUserWithRole();
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 401 });
    }

    // Initialize VC issuer
    const vcIssuer = new ProductionVCIssuer();
    
    // Check if we have a valid signing key
    const keyManager = ProductionKeyManager.getInstance();
    let currentKey = keyManager.getCurrentKey();
    
    if (!currentKey) {
      // Generate a new production key
      currentKey = await keyManager.generateProductionKey();
    }

    // Validate the key
    const keyValid = await keyManager.validateKey(currentKey.kid);
    if (!keyValid) {
      return NextResponse.json({ 
        error: 'Invalid signing key. Please contact administrator.' 
      }, { status: 500 });
    }

    // Create issuance request
    const issuanceRequest: IssuanceRequest = {
      credentialSubject: body.credentialSubject,
      credentialType: body.credentialType,
      validityPeriod: body.validityPeriod,
      customFields: body.customFields,
      metadata: {
        ...body.metadata,
        issuedBy: user.id,
        issuedAt: new Date().toISOString()
      }
    };

    // Issue the credential
    const result = await vcIssuer.issueCredential(
      issuanceRequest,
      user.id,
      user.id // Self-approval for faculty/admin
    );

    if (!result.success) {
      return NextResponse.json({ 
        error: result.error || 'Failed to issue credential' 
      }, { status: 400 });
    }

    // Store the credential in the database
    const supabase = await createSupabaseServerClient();
    const { error: dbError } = await supabase
      .from('verifiable_credentials')
      .insert({
        id: result.credential!.id,
        user_id: body.credentialSubject.id,
        issuer: result.credential!.issuer,
        issuance_date: result.credential!.issuanceDate,
        credential: result.credential!,
        status: 'active',
        created_at: new Date().toISOString(),
        metadata: {
          issuanceId: result.issuanceId,
          credentialType: body.credentialType,
          keyId: currentKey.kid,
          issuedBy: user.id
        }
      });

    if (dbError) {
      console.error('Database error:', dbError);
      return NextResponse.json({ 
        error: 'Failed to store credential in database' 
      }, { status: 500 });
    }

    // Log the issuance
    await supabase.from('audit_logs').insert({
      user_id: user.id,
      action: 'issue_vc',
      target_id: result.credential!.id,
      details: {
        credentialType: body.credentialType,
        issuanceId: result.issuanceId,
        keyId: currentKey.kid,
        validationPassed: result.validationResult?.isValid || false
      },
      created_at: new Date().toISOString(),
    });

    return NextResponse.json({
      data: {
        credential: result.credential,
        issuanceId: result.issuanceId,
        timestamp: result.timestamp,
        validationResult: result.validationResult
      }
    });

  } catch (error: any) {
    console.error('VC issuance error:', error);
    return NextResponse.json({ 
      error: error.message || 'Internal server error' 
    }, { status: 500 });
  }
}
