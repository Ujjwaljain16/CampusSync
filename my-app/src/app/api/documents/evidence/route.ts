import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const documentId = searchParams.get('documentId');
    if (!documentId) return NextResponse.json({ error: 'documentId required' }, { status: 400 });

    const { data, error } = await supabase
      .from('document_metadata')
      .select('verification_details, ai_confidence_score')
      .eq('document_id', documentId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !data) return NextResponse.json({}, { status: 200 });

    const details = (data as any).verification_details || {};
    const out = {
      qr: details.qr || null,
      mrz: details.mrz || null,
      logo: details.logo || null,
      policy: details.policy || null,
      extracted: details.extracted || null,
      confidence: (data as any).ai_confidence_score ?? undefined
    };
    return NextResponse.json(out);
  } catch (e) {
    return NextResponse.json({}, { status: 200 });
  }
}


