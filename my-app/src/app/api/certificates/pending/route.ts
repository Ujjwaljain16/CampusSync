import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient, requireRole } from '../../../../../lib/supabaseServer';

export async function GET(_req: NextRequest) {
  const auth = await requireRole(['faculty', 'admin']);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const supabase = await createSupabaseServerClient();
  // Flagged queue: pending certificates that are NOT auto-approved (from verification_results)
  const { data, error } = await supabase
    .from('certificates')
    .select('*, verification_results:verification_results(confidence_score, auto_approved, details)')
    .eq('verification_status', 'pending')
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Filter to only those that require manual review (auto_approved === false)
  const flagged = (data || []).filter((row: any) => {
    const vr = Array.isArray(row.verification_results) ? row.verification_results[0] : row.verification_results;
    return vr ? vr.auto_approved === false : true; // if no result, keep for review
  });

  return NextResponse.json({ data: flagged });
}


