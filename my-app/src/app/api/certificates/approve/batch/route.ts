import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient, requireRole, getServerUserWithRole } from '@/lib/supabaseServer';

export async function POST(req: NextRequest) {
  const auth = await requireRole(['faculty', 'admin']);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const body = await req.json().catch(() => null) as { certificates: { id: string; status: 'approved' | 'rejected'; reason?: string; metadataId?: string; }[] } | null;
  if (!body || !Array.isArray(body.certificates) || body.certificates.length === 0) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { user } = await getServerUserWithRole();

  const results: { id: string; ok: boolean; error?: string }[] = [];
  for (const item of body.certificates) {
    try {
      // Map API status to database verification_status
      const verificationStatus = item.status === 'approved' ? 'verified' : 'rejected';
      
      const { error: updateErr } = await supabase
        .from('certificates')
        .update({ verification_status: verificationStatus, updated_at: new Date().toISOString() })
        .eq('id', item.id);
      if (updateErr) throw new Error(updateErr.message);

      if (item.status === 'approved' && item.metadataId) {
        await supabase
          .from('certificate_metadata')
          .update({ verification_method: 'manual' })
          .eq('id', item.metadataId);
      }

      await supabase.from('audit_logs').insert({
        user_id: user?.id ?? null,
        action: item.status === 'approved' ? 'manual_approve' : 'manual_reject',
        target_id: item.id,
        details: { reason: item.reason ?? null, metadataId: item.metadataId ?? null },
        created_at: new Date().toISOString(),
      });

      results.push({ id: item.id, ok: true });
    } catch (e: unknown) {
      results.push({ id: item.id, ok: false, error: e instanceof Error ? e.message : 'Unknown error' });
    }
  }

  return NextResponse.json({ data: { results } });
}



