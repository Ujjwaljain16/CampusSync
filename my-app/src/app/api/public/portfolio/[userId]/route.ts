import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '../../../../../../lib/supabaseServer';

export async function GET(_req: NextRequest, context: { params: { userId: string } }) {
  const { userId } = context.params;
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from('verifiable_credentials')
    .select('id, issuer, issuance_date, credential')
    .eq('user_id', userId)
    .order('issuance_date', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data });
}


