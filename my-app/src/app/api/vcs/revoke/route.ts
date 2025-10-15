import { NextRequest } from 'next/server';
import { withRole, success, apiError, parseAndValidateBody } from '@/lib/api';
import { createSupabaseServerClient } from '@/lib/supabaseServer';

interface RevokeBody {
  credentialId: string;
  reason?: string;
}

export const POST = withRole(['admin', 'faculty'], async (req: NextRequest, { user }) => {
  const result = await parseAndValidateBody<RevokeBody>(req, ['credentialId']);
  if (result.error) return result.error;
  
  const body = result.data;

  const supabase = await createSupabaseServerClient();

  // Update VC status and set revoked_at
  const now = new Date().toISOString();
  const { error: updateError } = await supabase
    .from('verifiable_credentials')
    .update({ status: 'revoked', revoked_at: now, revoked_reason: body.reason ?? null })
    .eq('id', body.credentialId);

  if (updateError) {
    throw apiError.internal(updateError.message);
  }

  // Insert into revocation_list
  const { error: revokeListError } = await supabase
    .from('revocation_list')
    .insert({ credential_id: body.credentialId, reason: body.reason ?? null, revoked_at: now, created_at: now });

  if (revokeListError) {
    // Log but continue; revocation still applied
    console.error('Failed to insert into revocation_list:', revokeListError);
  }

  // Audit log
  try {
    await supabase.from('audit_logs').insert({
      user_id: user.id,
      action: 'revoke_vc',
      entity_type: 'verifiable_credential',
      entity_id: body.credentialId,
      details: { reason: body.reason ?? null },
      created_at: now,
    });
  } catch (auditError) {
    console.error('Audit log error:', auditError);
  }

  return success({ status: 'revoked', credentialId: body.credentialId });
});



