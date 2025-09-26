// Unified document status API
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const documentId = searchParams.get('documentId');

    if (!documentId) {
      return NextResponse.json({ error: 'Document ID required' }, { status: 400 });
    }

    // Get document status and metadata
    const { data: document, error: docError } = await supabase
      .from('documents')
      .select(`
        id,
        document_type,
        title,
        institution,
        verification_status,
        created_at,
        updated_at,
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

    // Get recent audit logs for this document
    const { data: auditLogs, error: auditError } = await supabase
      .from('audit_logs')
      .select('action, details, created_at')
      .eq('target_id', documentId)
      .order('created_at', { ascending: false })
      .limit(10);

    if (auditError) {
      console.error('Audit logs fetch error:', auditError);
    }

    const status = {
      documentId: document.id,
      type: document.document_type,
      title: document.title,
      institution: document.institution,
      status: document.verification_status,
      confidence: document.document_metadata?.[0]?.ai_confidence_score,
      details: document.document_metadata?.[0]?.verification_details,
      createdAt: document.created_at,
      updatedAt: document.updated_at,
      auditTrail: auditLogs || []
    };

    return NextResponse.json(status);

  } catch (error) {
    console.error('Document status fetch error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { documentIds } = await request.json();

    if (!documentIds || !Array.isArray(documentIds)) {
      return NextResponse.json({ error: 'Document IDs array required' }, { status: 400 });
    }

    // Get status for multiple documents
    const { data: documents, error: docError } = await supabase
      .from('documents')
      .select(`
        id,
        document_type,
        title,
        institution,
        verification_status,
        created_at,
        updated_at,
        document_metadata (
          ai_confidence_score,
          verification_details
        )
      `)
      .in('id', documentIds);

    if (docError) {
      console.error('Documents fetch error:', docError);
      return NextResponse.json({ error: 'Failed to fetch documents' }, { status: 500 });
    }

    const statuses = documents.map(doc => ({
      documentId: doc.id,
      type: doc.document_type,
      title: doc.title,
      institution: doc.institution,
      status: doc.verification_status,
      confidence: doc.document_metadata?.[0]?.ai_confidence_score,
      details: doc.document_metadata?.[0]?.verification_details,
      createdAt: doc.created_at,
      updatedAt: doc.updated_at
    }));

    return NextResponse.json({ documents: statuses });

  } catch (error) {
    console.error('Bulk document status fetch error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
