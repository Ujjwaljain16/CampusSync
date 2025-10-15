// Unified document verification API
import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { success, apiError, parseAndValidateBody, isValidUUID } from '@/lib/api';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface VerifyDocumentBody {
  documentId: string;
  verificationStatus: string;
  reason?: string;
  confidence?: number;
}

export async function POST(request: NextRequest) {
  const result = await parseAndValidateBody<VerifyDocumentBody>(
    request, 
    ['documentId', 'verificationStatus']
  );
  if (result.error) return result.error;
  
  const { documentId, verificationStatus, reason, confidence } = result.data;

  // Validate UUID format for documentId
  if (!isValidUUID(documentId)) {
    throw apiError.badRequest('Invalid document ID format');
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
    throw apiError.internal('Failed to update document');
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
  try {
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from('audit_logs').insert({
      user_id: user?.id,
      action: 'verify_document',
      target_id: documentId,
      details: { verification_status: verificationStatus, reason },
      created_at: new Date().toISOString()
    });
  } catch (auditError) {
    console.error('Audit log error:', auditError);
    // Don't fail the request, just log the error
  }

  return success({
    success: true,
    documentId,
    verificationStatus
  }, 'Document verification updated successfully');
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const documentId = searchParams.get('documentId');

  if (!documentId) {
    throw apiError.badRequest('Document ID required');
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
    throw apiError.notFound('Document not found');
  }

  return success({
    document,
    verification: {
      status: document.verification_status,
      confidence: document.document_metadata?.[0]?.ai_confidence_score,
      details: document.document_metadata?.[0]?.verification_details
    }
  });
}
