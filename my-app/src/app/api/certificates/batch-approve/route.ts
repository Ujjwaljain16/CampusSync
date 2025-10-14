import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient, requireRole } from '@/lib/supabaseServer';

export async function POST(req: NextRequest) {
  try {
    const auth = await requireRole(['faculty', 'admin']);
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.message }, { status: auth.status });
    }

    const body = await req.json().catch(() => null) as {
      certificateIds: string[];
      status: 'approved' | 'rejected';
      reason: string;
    } | null;

    if (!body || !body.certificateIds || !body.status) {
      return NextResponse.json({ 
        error: 'Missing required fields: certificateIds, status' 
      }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    
    // Update all certificates
    const { data, error } = await supabase
      .from('certificates')
      .update({
        verification_status: body.status,
        faculty_notes: body.reason,
        reviewed_by: auth.user?.id,
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .in('id', body.certificateIds)
      .select();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Log the batch action
    await supabase.from('audit_logs').insert({
      user_id: auth.user?.id,
      action: 'batch_certificate_review',
      target_id: body.certificateIds.join(','),
      details: {
        status: body.status,
        reason: body.reason,
        count: body.certificateIds.length
      },
      created_at: new Date().toISOString()
    });

    return NextResponse.json({
      data: {
        updated: data?.length || 0,
        status: body.status,
        certificateIds: body.certificateIds
      }
    });

  } catch (error: any) {
    console.error('Batch approval error:', error);
    return NextResponse.json({ 
      error: error.message || 'Internal server error' 
    }, { status: 500 });
  }
}