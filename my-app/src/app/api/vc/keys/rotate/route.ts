import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient, requireRole } from '@/lib/supabaseServer';
import { ProductionKeyManager } from '../../../../../../lib/vc/productionKeyManager';

// POST /api/vc/keys/rotate - admin only
export async function POST(_req: NextRequest) {
  const auth = await requireRole(['admin']);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  try {
    const km = ProductionKeyManager.getInstance();
    const newKey = await km.rotateKey();

    // Audit
    const supabase = await createSupabaseServerClient();
    await supabase.from('audit_logs').insert({
      user_id: auth.user.id,
      action: 'vc_key_rotate',
      target_id: newKey.kid,
      details: { alg: newKey.alg },
      created_at: new Date().toISOString(),
    });

    return NextResponse.json({ success: true, keyId: newKey.kid });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Rotation failed' }, { status: 500 });
  }
}



