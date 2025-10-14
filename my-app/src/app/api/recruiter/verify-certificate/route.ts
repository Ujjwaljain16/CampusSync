import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient, requireRole } from '@/lib/supabaseServer';

export async function POST(req: NextRequest) {
  try {
    const auth = await requireRole(['recruiter', 'admin']);
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.message }, { status: auth.status });
    }

    const body = await req.json().catch(() => null) as {
      certificate_id: string;
      action: 'verify' | 'flag';
      notes?: string;
    } | null;

    if (!body || !body.certificate_id || !body.action) {
      return NextResponse.json({ 
        error: 'Missing required fields: certificate_id, action' 
      }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    
    // Get the certificate
    const { data: certificate, error: certError } = await supabase
      .from('certificates')
      .select('*')
      .eq('id', body.certificate_id)
      .single();

    if (certError || !certificate) {
      return NextResponse.json({ error: 'Certificate not found' }, { status: 404 });
    }

    // Update verification status
    const updateData = {
      recruiter_verified: body.action === 'verify',
      recruiter_notes: body.notes || null,
      verified_by_recruiter: auth.user?.id,
      recruiter_verification_date: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('certificates')
      .update(updateData)
      .eq('id', body.certificate_id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Log the verification action
    await supabase.from('audit_logs').insert({
      user_id: auth.user?.id,
      action: 'recruiter_certificate_verification',
      target_id: body.certificate_id,
      details: {
        action: body.action,
        notes: body.notes,
        certificate_title: certificate.title,
        student_id: certificate.student_id
      },
      created_at: new Date().toISOString()
    });

    return NextResponse.json({
      data: {
        certificate_id: body.certificate_id,
        action: body.action,
        verified: body.action === 'verify',
        verification_date: updateData.recruiter_verification_date
      }
    });

  } catch (error: any) {
    console.error('Certificate verification error:', error);
    return NextResponse.json({ 
      error: error.message || 'Internal server error' 
    }, { status: 500 });
  }
}