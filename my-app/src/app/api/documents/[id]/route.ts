import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabaseServer';

// GET /api/documents/[id]
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .eq('id', params.id)
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 404 });
    return NextResponse.json({ data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Internal error' }, { status: 500 });
  }
}

// PATCH /api/documents/[id]
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = await createSupabaseServerClient();
    const body = await req.json();
    const { data, error } = await supabase
      .from('documents')
      .update({
        title: body.title,
        institution: body.institution,
        issue_date: body.issue_date,
        verification_status: body.verification_status,
        metadata: body.metadata
      })
      .eq('id', params.id)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Internal error' }, { status: 500 });
  }
}


