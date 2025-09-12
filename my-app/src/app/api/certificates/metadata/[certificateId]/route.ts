import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient, requireRole } from '../../../../../../lib/supabaseServer';

export async function GET(_req: NextRequest, context: { params: { certificateId: string } }) {
  const auth = await requireRole(['faculty', 'admin']);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const { certificateId } = context.params;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('certificate_metadata')
    .select('*')
    .eq('certificate_id', certificateId)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}


