import { NextRequest } from 'next/server';
import { success, apiError } from '@/lib/api';
import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { getIssuerJwk, verifyCredentialJws } from '../../../../../lib/vc';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const vcId = searchParams.get('vcId');
  if (!vcId) {
    throw apiError.badRequest('Missing vcId');
  }

  const supabase = await createSupabaseServerClient();

  // Fetch credential
  const { data: vcRow, error } = await supabase
    .from('verifiable_credentials')
    .select('*')
    .eq('id', vcId)
    .single();

  if (error || !vcRow) {
    return success({ valid: false, revoked: false, reason: 'Credential not found' });
  }

  // Check revocation via status field first
  if (vcRow.status === 'revoked') {
    return success({ valid: false, revoked: true, reason: vcRow.revoked_reason || 'revoked' });
  }

  // Check revocation_list as source of truth
  const { data: rev } = await supabase
    .from('revocation_list')
    .select('*')
    .eq('credential_id', vcId)
    .order('revoked_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (rev) {
    return success({ valid: false, revoked: true, reason: rev.reason || 'revoked' });
  }

  // Verify signature
  try {
    const jwk = await getIssuerJwk();
    const jws: string | undefined = vcRow.credential?.proof?.jws;
    if (!jws) {
      return success({ valid: false, revoked: false, reason: 'Missing JWS' });
    }
    await verifyCredentialJws(jws, jwk);
    return success({ valid: true, revoked: false });
  } catch (e) {
    const reason = e instanceof Error ? e.message : 'Signature invalid';
    return success({ valid: false, revoked: false, reason });
  }
}



