// Unified document verification API
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const { documentId, verificationStatus, reason, confidence } = await request.json();

    if (!documentId || !verificationStatus) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Update document verification status
    const { error: updateError } = await supabase
      .from('documents')
      .update({
        verification_status: verificationStatus,
        updated_at: new Date().toISOString()
      })
      .eq('id', documentId);

    if (updateError) {
      console.error('Document update error:', updateError);
      return NextResponse.json({ error: 'Failed to update document' }, { status: 500 });
    }

    // Update document metadata if provided
    if (confidence !== undefined) {
      const { error: metadataError } = await supabase
        .from('document_metadata')
        .upsert({
          document_id: documentId,
          ai_confidence_score: confidence,
          verification_details: { reason, verified_at: new Date().toISOString() },
          updated_at: new Date().toISOString()
        });

      if (metadataError) {
        console.error('Metadata update error:', metadataError);
        // Don't fail the request, just log the error
      }
    }

    // Log audit entry
    const { error: auditError } = await supabase
      .from('audit_logs')
      .insert({
        actor_id: (await supabase.auth.getUser()).data.user?.id,
        target_id: documentId,
        action: 'verify_document',
        details: { verification_status: verificationStatus, reason },
        created_at: new Date().toISOString()
      });

    if (auditError) {
      console.error('Audit log error:', auditError);
      // Don't fail the request, just log the error
    }

    return NextResponse.json({ 
      success: true, 
      documentId, 
      verificationStatus,
      message: 'Document verification updated successfully'
    });

  } catch (error) {
    console.error('Document verification error:', error);
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

    // Get document with metadata
    const { data: document, error: docError } = await supabase
      .from('documents')
      .select(`
        *,
        document_metadata (
          ai_confidence_score,
          verification_details,
          created_at,
          updated_at
        )
      `)
      .eq('id', documentId)
      .single();

    if (docError || !document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    return NextResponse.json({
      document,
      verification: {
        status: document.verification_status,
        confidence: document.document_metadata?.[0]?.ai_confidence_score,
        details: document.document_metadata?.[0]?.verification_details
      }
    });

  } catch (error) {
    console.error('Document verification fetch error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
