import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient, requireRole } from '../../../../../lib/supabaseServer';

export async function POST(req: NextRequest) {
  try {
    const auth = await requireRole(['faculty', 'admin']);
    
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.message }, { status: auth.status });
    }

    const { certificateIds, action } = await req.json();

    if (!certificateIds || !Array.isArray(certificateIds) || certificateIds.length === 0) {
      return NextResponse.json({ error: 'Certificate IDs are required' }, { status: 400 });
    }

    if (!action || !['approve', 'reject'].includes(action)) {
      return NextResponse.json({ error: 'Action must be "approve" or "reject"' }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    const results = [];

    for (const certificateId of certificateIds) {
      try {
        // Get certificate details for VC issuance if approving
        let certificate = null;
        if (action === 'approve') {
          const { data: cert, error: certError } = await supabase
            .from('certificates')
            .select('*')
            .eq('id', certificateId)
            .single();

          if (certError || !cert) {
            results.push({ certificateId, success: false, error: 'Certificate not found' });
            continue;
          }
          certificate = cert;
        }

        // Update certificate status
        const { error: updateError } = await supabase
          .from('certificates')
          .update({ 
            verification_status: action === 'approve' ? 'verified' : 'rejected',
            updated_at: new Date().toISOString()
          })
          .eq('id', certificateId);

        if (updateError) {
          results.push({ certificateId, success: false, error: updateError.message });
          continue;
        }

        // Issue VC if approving
        if (action === 'approve' && certificate) {
          try {
            const subject = {
              id: certificate.user_id,
              certificateId: certificate.id,
              title: certificate.title,
              institution: certificate.institution,
              dateIssued: certificate.date_issued,
              description: certificate.description,
            };

            const vcResponse = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/certificates/issue`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ credentialSubject: subject }),
            });

            if (!vcResponse.ok) {
              console.error(`Failed to issue VC for certificate ${certificateId}`);
            }
          } catch (vcError) {
            console.error(`VC issuance error for certificate ${certificateId}:`, vcError);
          }
        }

        results.push({ certificateId, success: true });

      } catch (error: any) {
        results.push({ 
          certificateId, 
          success: false, 
          error: error.message || 'Unknown error' 
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;

    return NextResponse.json({
      data: {
        action,
        totalProcessed: certificateIds.length,
        successCount,
        failureCount,
        results
      }
    });

  } catch (error: any) {
    console.error('Batch approval error:', error);
    return NextResponse.json({ 
      error: error.message || 'Internal server error' 
    }, { status: 500 });
  }
}
