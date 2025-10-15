import { NextRequest } from 'next/server';
import { withRole, success, apiError, parseAndValidateBody } from '@/lib/api';
import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { VCRevocationManager } from '../../../../../lib/vc/vcRevocationManager';

interface RevokeVCBody {
  credentialId: string;
  reasonCode: string;
  metadata?: Record<string, unknown>;
}

export const POST = withRole(['faculty', 'admin'], async (req: NextRequest, { user }) => {
  const result = await parseAndValidateBody<RevokeVCBody>(req, ['credentialId', 'reasonCode']);
  if (result.error) return result.error;

  const body = result.data;

  // Get the credential from database
  const supabase = await createSupabaseServerClient();
  const { data: credential, error: credError } = await supabase
    .from('verifiable_credentials')
    .select('*')
    .eq('id', body.credentialId)
    .single();

  if (credError || !credential) {
    throw apiError.notFound('Credential not found');
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
    throw apiError.internal('Failed to update credential status');
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

  return success({
    revocationRecord,
    credentialId: body.credentialId,
    status: 'revoked',
    timestamp: new Date().toISOString()
  }, 'Credential revoked successfully');
});

export const GET = withRole(['faculty', 'admin'], async () => {
  const revocationManager = VCRevocationManager.getInstance();
  const stats = revocationManager.getRevocationStats();

  return success(stats);
});

