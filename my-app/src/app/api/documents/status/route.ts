// Unified document status API
import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { success, apiError } from '@/lib/api';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const documentId = searchParams.get('documentId');

  // For testing, allow empty documentId
  if (!documentId && process.env.NODE_ENV === 'production') {
    throw apiError.badRequest('Document ID required');
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
    throw apiError.notFound('Document not found');
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

  return success({
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
  });
}

export async function POST(request: NextRequest) {
  const { documentIds } = await request.json();

  if (!documentIds || !Array.isArray(documentIds)) {
    throw apiError.badRequest('Document IDs array required');
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
    throw apiError.internal('Failed to fetch documents');
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

  return success({ documents: statuses });
}
