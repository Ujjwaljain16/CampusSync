import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabaseServer';

// GET /api/vc/status?credentialId=...
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const credentialId = searchParams.get('credentialId');
    if (!credentialId) {
      return NextResponse.json({ error: 'Missing credentialId' }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from('vc_status_registry')
      .select('*')
      .eq('credential_id', credentialId)
      .order('recorded_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      data: data || { status: 'active' }
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Internal error' }, { status: 500 });
  }
}



