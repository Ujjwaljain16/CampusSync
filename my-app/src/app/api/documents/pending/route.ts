import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient, getServerUserWithRole } from '@/lib/supabaseServer';

// GET /api/documents/pending - list pending documents for faculty/admin
export async function GET(_req: NextRequest) {
  try {
    const { user, role } = await getServerUserWithRole();
    if (!user || (role !== 'faculty' && role !== 'admin')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .eq('verification_status', 'pending')
      .order('created_at', { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Internal error' }, { status: 500 });
  }
}



