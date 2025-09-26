// Unified document revocation API
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const { documentId, reason, revokedBy } = await request.json();

    if (!documentId || !reason) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Update document verification status to revoked
    const { error: updateError } = await supabase
      .from('documents')
      .update({
        verification_status: 'revoked',
        updated_at: new Date().toISOString()
      })
      .eq('id', documentId);

    if (updateError) {
      console.error('Document update error:', updateError);
      return NextResponse.json({ error: 'Failed to revoke document' }, { status: 500 });
    }

    // Update document metadata with revocation details
    const { error: metadataError } = await supabase
      .from('document_metadata')
      .upsert({
        document_id: documentId,
        verification_details: { 
          revoked: true, 
          reason, 
          revoked_by: revokedBy,
          revoked_at: new Date().toISOString() 
        },
        updated_at: new Date().toISOString()
      });

    if (metadataError) {
      console.error('Metadata update error:', metadataError);
      // Don't fail the request, just log the error
    }

    // Log audit entry
    const { error: auditError } = await supabase
      .from('audit_logs')
      .insert({
        actor_id: (await supabase.auth.getUser()).data.user?.id,
        target_id: documentId,
        action: 'revoke_document',
        details: { reason, revoked_by: revokedBy },
        created_at: new Date().toISOString()
      });

    if (auditError) {
      console.error('Audit log error:', auditError);
      // Don't fail the request, just log the error
    }

    return NextResponse.json({ 
      success: true, 
      documentId, 
      status: 'revoked',
      message: 'Document revoked successfully'
    });

  } catch (error) {
    console.error('Document revocation error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const documentId = searchParams.get('documentId');

    if (!documentId) {
      return NextResponse.json({ error: 'Document ID required' }, { status: 400 });
    }

    // Check if document is revoked
    const { data: document, error: docError } = await supabase
      .from('documents')
      .select(`
        id,
        verification_status,
        document_metadata (
          verification_details
        )
      `)
      .eq('id', documentId)
      .single();

    if (docError || !document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    const isRevoked = document.verification_status === 'revoked';
    const revocationDetails = document.document_metadata?.[0]?.verification_details;

    return NextResponse.json({
      documentId,
      isRevoked,
      status: document.verification_status,
      revocationDetails: isRevoked ? revocationDetails : null
    });

  } catch (error) {
    console.error('Document revocation check error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
