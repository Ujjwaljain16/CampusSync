import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient, getServerUserWithRole } from '../../../../../lib/supabaseServer';

export async function POST(request: NextRequest) {
  try {
    const { user, role } = await getServerUserWithRole();
    
    // Check if user is recruiter or admin
    if (!user || (role !== 'recruiter' && role !== 'admin')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { certificate_id, action } = body;

    if (!certificate_id) {
      return NextResponse.json({ error: 'Certificate ID is required' }, { status: 400 });
    }

    if (!action || !['verify', 'reject'].includes(action)) {
      return NextResponse.json({ error: 'Action must be "verify" or "reject"' }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    const newStatus = action === 'verify' ? 'verified' : 'rejected';

    // Get current certificate details
    const { data: certificate, error: fetchError } = await supabase
      .from('certificates')
      .select('id, student_id, title, verification_status')
      .eq('id', certificate_id)
      .single();

    if (fetchError || !certificate) {
      return NextResponse.json({ error: 'Certificate not found' }, { status: 404 });
    }

    // Update certificate status
    const { error: updateError } = await supabase
      .from('certificates')
      .update({ 
        verification_status: newStatus,
        updated_at: new Date().toISOString()
      })
      .eq('id', certificate_id);

    if (updateError) {
      console.error('Error updating certificate:', updateError);
      return NextResponse.json({ error: 'Failed to update certificate' }, { status: 500 });
    }

    // Create audit log (align with existing schema)
    const { error: auditError } = await supabase
      .from('audit_logs')
      .insert({
        user_id: user.id,
        action: `certificate_${action}`,
        target_id: certificate_id,
        details: {
          student_id: certificate.student_id,
          certificate_title: certificate.title,
          previous_status: certificate.verification_status,
          new_status: newStatus,
          verified_by: user.id,
          verified_at: new Date().toISOString()
        },
        created_at: new Date().toISOString()
      });

    if (auditError) {
      console.error('Error creating audit log:', auditError);
      // Don't fail the request for audit log errors
    }

    // If verifying, issue VC for the certificate
    if (action === 'verify') {
      try {
        const vcResponse = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL}/api/vc/issue`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${user.id}` // In production, use proper auth
          },
          body: JSON.stringify({
            certificate_id: certificate_id,
            student_id: certificate.student_id
          })
        });

        if (!vcResponse.ok) {
          console.error('Failed to issue VC for certificate');
        }
      } catch (vcError) {
        console.error('Error issuing VC:', vcError);
        // Don't fail the request for VC issuance errors
      }
    }

    return NextResponse.json({
      success: true,
      message: `Certificate successfully ${action}ed`,
      certificate_id: certificate_id,
      new_status: newStatus
    });

  } catch (error) {
    console.error('Verify certificate API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
