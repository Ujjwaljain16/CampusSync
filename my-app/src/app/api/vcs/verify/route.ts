import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '../../../../../lib/supabaseServer';
import { getIssuerJwk, verifyCredentialJws } from '../../../../../lib/vc';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const vcId = searchParams.get('vcId');
  if (!vcId) {
    return NextResponse.json({ error: 'Missing vcId' }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();

  // Fetch credential
  const { data: vcRow, error } = await supabase
    .from('verifiable_credentials')
    .select('*')
    .eq('id', vcId)
    .single();

  if (error || !vcRow) {
    return NextResponse.json({ data: { valid: false, revoked: false, reason: 'Credential not found' } }, { status: 200 });
  }

  // Check revocation via status field first
  if (vcRow.status === 'revoked') {
    return NextResponse.json({ data: { valid: false, revoked: true, reason: vcRow.revoked_reason || 'revoked' } }, { status: 200 });
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
    return NextResponse.json({ data: { valid: false, revoked: true, reason: rev.reason || 'revoked' } }, { status: 200 });
  }

  // Verify signature
  try {
    const jwk = await getIssuerJwk();
    const jws: string | undefined = vcRow.credential?.proof?.jws;
    if (!jws) {
      return NextResponse.json({ data: { valid: false, revoked: false, reason: 'Missing JWS' } }, { status: 200 });
    }
    await verifyCredentialJws(jws, jwk);
    return NextResponse.json({ data: { valid: true, revoked: false } }, { status: 200 });
  } catch (e) {
    const reason = e instanceof Error ? e.message : 'Signature invalid';
    return NextResponse.json({ data: { valid: false, revoked: false, reason } }, { status: 200 });
  }
}


