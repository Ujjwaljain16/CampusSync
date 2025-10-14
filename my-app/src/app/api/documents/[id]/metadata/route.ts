import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabaseServer';

// GET /api/documents/[id]/metadata
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createSupabaseServerClient();
    const { id } = await params;
    const { data, error } = await supabase
      .from('document_metadata')
      .select('*')
      .eq('document_id', id)
      .maybeSingle();
    if (error && error.code !== 'PGRST116') return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data: data || null });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Internal error' }, { status: 500 });
  }
}

// POST /api/documents/[id]/metadata
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createSupabaseServerClient();
    const body = await req.json();
    const { id } = await params;
    const { data, error } = await supabase
      .from('document_metadata')
      .upsert({
        document_id: id,
        ai_confidence_score: body.ai_confidence_score,
        verification_details: body.verification_details,
        extracted_fields: body.extracted_fields,
        updated_at: new Date().toISOString()
      }, { onConflict: 'document_id' })
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Internal error' }, { status: 500 });
  }
}


