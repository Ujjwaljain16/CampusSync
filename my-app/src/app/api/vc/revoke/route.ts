import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient, requireRole, getServerUserWithRole } from '@/lib/supabaseServer';
import { VCRevocationManager } from '../../../../../lib/vc/vcRevocationManager';
import type { VerifiableCredential } from '../../../../types';

export async function POST(req: NextRequest) {
  try {
    const auth = await requireRole(['faculty', 'admin']);
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.message }, { status: auth.status });
    }

    const body = await req.json().catch(() => null) as {
      credentialId: string;
      reasonCode: string;
      metadata?: Record<string, any>;
    } | null;

    if (!body || !body.credentialId || !body.reasonCode) {
      return NextResponse.json({ 
        error: 'Missing required fields: credentialId, reasonCode' 
      }, { status: 400 });
    }

    const { user } = await getServerUserWithRole();
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 401 });
    }

    // Get the credential from database
    const supabase = await createSupabaseServerClient();
    const { data: credential, error: credError } = await supabase
      .from('verifiable_credentials')
      .select('*')
      .eq('id', body.credentialId)
      .single();

    if (credError || !credential) {
      return NextResponse.json({ 
        error: 'Credential not found' 
      }, { status: 404 });
    }

    // Initialize revocation manager
    const revocationManager = VCRevocationManager.getInstance();

    // Revoke the credential
    const revocationRecord = await revocationManager.revokeCredential(
      body.credentialId,
      user.id,
      body.reasonCode,
      {
        ...body.metadata,
        issuer: credential.issuer,
        revokedBy: user.id,
        originalIssuer: credential.metadata?.issuedBy
      }
    );

    // Update credential status in database
    const { error: updateError } = await supabase
      .from('verifiable_credentials')
      .update({ 
        status: 'revoked',
        revoked_at: new Date().toISOString(),
        revoked_reason: revocationRecord.reason.description,
        metadata: {
          ...credential.metadata,
          revocationRecord: {
            id: revocationRecord.id,
            reason: revocationRecord.reason,
            revokedAt: revocationRecord.revokedAt,
            revokedBy: revocationRecord.revokedBy
          }
        }
      })
      .eq('id', body.credentialId);

    if (updateError) {
      console.error('Database update error:', updateError);
      return NextResponse.json({ 
        error: 'Failed to update credential status' 
      }, { status: 500 });
    }

    // Write to status registry
    await supabase.from('vc_status_registry').insert({
      credential_id: body.credentialId,
      status: 'revoked',
      reason_code: body.reasonCode,
      reason: revocationRecord.reason.description,
      issuer: credential.issuer,
      subject_id: credential.user_id || null,
      recorded_by: user.id,
      metadata: { revocationId: revocationRecord.id }
    });

    // Log the revocation
    await supabase.from('audit_logs').insert({
      user_id: user.id,
      action: 'revoke_vc',
      target_id: body.credentialId,
      details: {
        reasonCode: body.reasonCode,
        reason: revocationRecord.reason.description,
        revocationId: revocationRecord.id,
        originalIssuer: credential.metadata?.issuedBy
      },
      created_at: new Date().toISOString(),
    });

    return NextResponse.json({
      data: {
        revocationRecord,
        credentialId: body.credentialId,
        status: 'revoked',
        timestamp: new Date().toISOString()
      }
    });

  } catch (error: any) {
    console.error('VC revocation error:', error);
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

    const revocationManager = VCRevocationManager.getInstance();
    const stats = revocationManager.getRevocationStats();

    return NextResponse.json({
      data: stats
    });

  } catch (error: any) {
    console.error('VC revocation stats error:', error);
    return NextResponse.json({ 
      error: error.message || 'Internal server error' 
    }, { status: 500 });
  }
}

