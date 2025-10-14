import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient, requireRole, getServerUserWithRole } from '@/lib/supabaseServer';

export async function POST(req: NextRequest) {
  try {
    const auth = await requireRole(['faculty', 'admin']);
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.message }, { status: auth.status });
    }

    const { certificateId, reason } = await req.json();
    
    if (!certificateId) {
      return NextResponse.json({ error: 'Certificate ID is required' }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    const { user } = await getServerUserWithRole();

    // Get the certificate details
    const { data: certificate, error: certError } = await supabase
      .from('certificates')
      .select('*')
      .eq('id', certificateId)
      .single();

    if (certError || !certificate) {
      return NextResponse.json({ error: 'Certificate not found' }, { status: 404 });
    }

    // Check if certificate is currently verified (can only revert verified certificates)
    if (certificate.verification_status !== 'verified') {
      return NextResponse.json({ 
        error: 'Can only revert verified certificates' 
      }, { status: 400 });
    }

    // Revert certificate status to pending
    const { error: updateError } = await supabase
      .from('certificates')
      .update({ 
        verification_status: 'pending',
        updated_at: new Date().toISOString()
      })
      .eq('id', certificateId);

    if (updateError) {
      console.error('Error reverting certificate:', updateError);
      return NextResponse.json({ error: 'Failed to revert certificate' }, { status: 500 });
    }

    // Revoke the associated Verifiable Credential if it exists
    const { data: vc, error: vcError } = await supabase
      .from('verifiable_credentials')
      .select('id')
      .eq('user_id', certificate.user_id)
      .contains('credential', { credentialSubject: { certificateId } })
      .single();

    if (vc && !vcError) {
      // Update VC status to revoked
      const { error: revokeError } = await supabase
        .from('verifiable_credentials')
        .update({ 
          status: 'revoked',
          revoked_at: new Date().toISOString(),
          revoked_reason: reason || 'Approval reverted by faculty'
        })
        .eq('id', vc.id);

      if (revokeError) {
        console.error('Error revoking VC:', revokeError);
        // Don't fail the entire operation if VC revocation fails
      }
    }

    // Create audit log for the revert action
    const { error: auditError } = await supabase
      .from('audit_logs')
      .insert({
        user_id: user?.id ?? null,
        action: 'revert_approval',
        target_id: certificateId,
        details: { 
          reason: reason || 'No reason provided',
          previous_status: 'verified',
          new_status: 'pending'
        },
        created_at: new Date().toISOString(),
      });

    if (auditError) {
      console.error('Error creating audit log:', auditError);
      // Don't fail the operation if audit logging fails
    }

    return NextResponse.json({ 
      data: { 
        success: true, 
        message: 'Certificate approval reverted successfully',
        certificateId,
        newStatus: 'pending'
      } 
    });

  } catch (error: any) {
    console.error('Revert approval error:', error);
    return NextResponse.json({ 
      error: error.message || 'Internal server error' 
    }, { status: 500 });
  }
}

