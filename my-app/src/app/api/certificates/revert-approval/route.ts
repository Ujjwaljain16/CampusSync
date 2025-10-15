import { NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { withRole, success, apiError, parseAndValidateBody } from '@/lib/api';

interface RevertApprovalBody {
  certificateId: string;
  reason?: string;
}

export const POST = withRole(['faculty', 'admin'], async (req: NextRequest, { user }) => {
  const result = await parseAndValidateBody<RevertApprovalBody>(req, ['certificateId']);
  if (result.error) return result.error;
  
  const { certificateId, reason } = result.data;
  const supabase = await createSupabaseServerClient();

    // Get the certificate details
    const { data: certificate, error: certError } = await supabase
      .from('certificates')
      .select('*')
      .eq('id', certificateId)
      .single();

  if (certError || !certificate) {
    throw apiError.notFound('Certificate not found');
  }

  // Check if certificate is currently verified (can only revert verified certificates)
  if (certificate.verification_status !== 'verified') {
    throw apiError.badRequest('Can only revert verified certificates');
  }

    // Revert certificate status to pending
    const { error: updateError } = await supabase
      .from('certificates')
      .update({ 
        verification_status: 'pending',
        updated_at: new Date().toISOString()
      })
      .eq('id', certificateId);

  if (updateError) {
    console.error('Error reverting certificate:', updateError);
    throw apiError.internal('Failed to revert certificate');
  }

  // Revoke the associated Verifiable Credential if it exists
  const { data: vc, error: vcError } = await supabase
    .from('verifiable_credentials')
    .select('id')
    .eq('user_id', certificate.user_id)
    .contains('credential', { credentialSubject: { certificateId } })
    .single();

  if (vc && !vcError) {
    // Update VC status to revoked
    const { error: revokeError } = await supabase
      .from('verifiable_credentials')
      .update({ 
        status: 'revoked',
        revoked_at: new Date().toISOString(),
        revoked_reason: reason || 'Approval reverted by faculty'
      })
      .eq('id', vc.id);

    if (revokeError) {
      console.error('Error revoking VC:', revokeError);
      // Don't fail the entire operation if VC revocation fails
    }
  }

  // Create audit log for the revert action
  try {
    await supabase.from('audit_logs').insert({
      user_id: user.id,
      action: 'revert_approval',
      target_id: certificateId,
      details: { 
        reason: reason || 'No reason provided',
        previous_status: 'verified',
        new_status: 'pending'
      },
      created_at: new Date().toISOString(),
    });
  } catch (auditError) {
    console.error('Error creating audit log:', auditError);
    // Don't fail the operation if audit logging fails
  }

  return success({
    success: true,
    certificateId,
    newStatus: 'pending'
  }, 'Certificate approval reverted successfully');
});

