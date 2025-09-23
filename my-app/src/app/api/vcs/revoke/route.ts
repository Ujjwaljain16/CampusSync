import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient, requireRole, getServerUserWithRole } from '../../../../../lib/supabaseServer';

export async function POST(req: NextRequest) {
  const auth = await requireRole(['admin', 'faculty']);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const body = await req.json().catch(() => null) as { credentialId?: string; reason?: string } | null;
  if (!body || !body.credentialId) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();

  // Update VC status and set revoked_at
  const now = new Date().toISOString();
  const { error: updateError } = await supabase
    .from('verifiable_credentials')
    .update({ status: 'revoked', revoked_at: now, revoked_reason: body.reason ?? null })
    .eq('id', body.credentialId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
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
    const { user } = await getServerUserWithRole();
    await supabase.from('audit_logs').insert({
      user_id: user?.id ?? null,
      action: 'revoke_vc',
      entity_type: 'verifiable_credential',
      entity_id: body.credentialId,
      details: { reason: body.reason ?? null },
      created_at: now,
    });
  } catch {
    // ignore audit failures
  }

  return NextResponse.json({ data: { status: 'revoked', credentialId: body.credentialId } });
}


