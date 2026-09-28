// Unified document verification API
import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { success, apiError, parseAndValidateBody, isValidUUID, getOrganizationContext, getTargetOrganizationIds } from '@/lib/api';
import { createSupabaseServerClient } from '@/lib/supabaseServer';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const REVIEWER_ROLES = ['faculty', 'admin', 'org_admin', 'super_admin'];
const ALLOWED_STATUSES = ['pending', 'verified', 'rejected'];

interface VerifyDocumentBody {
  documentId: string;
  verificationStatus: string;
  reason?: string;
  confidence?: number;
}

export async function POST(request: NextRequest) {
  // Get authenticated user
  const authSupabase = await createSupabaseServerClient();
  const { data: { user }, error: authError } = await authSupabase.auth.getUser();
  if (authError || !user) {
    throw apiError.unauthorized('Authentication required');
  }

  // Get organization context for multi-tenancy
  const orgContext = await getOrganizationContext(user);
  const targetOrgIds = getTargetOrganizationIds(orgContext);

  // Only reviewers may change verification status (students must not self-verify)
  if (!REVIEWER_ROLES.includes(orgContext.role)) {
    throw apiError.forbidden('Only faculty or admins can verify documents');
  }

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
  if (!ALLOWED_STATUSES.includes(verificationStatus)) {
    throw apiError.badRequest('Invalid verification status');
  }
  if (confidence !== undefined && confidence !== null && (typeof confidence !== 'number' || !Number.isFinite(confidence) || confidence < 0 || confidence > 100)) {
    throw apiError.badRequest('confidence must be a number between 0 and 100');
  }

  // Verify document belongs to user's organization before updating
  const { data: doc, error: fetchError } = await supabase
    .from('documents')
    .select('organization_id')
    .eq('id', documentId)
    .in('organization_id', targetOrgIds) // Multi-org filter
    .single();
    
  if (fetchError || !doc) {
    throw apiError.notFound('Document not found or access denied');
  }

  // Update document verification status
  const { error: updateError } = await supabase
    .from('documents')
    .update({
      verification_status: verificationStatus,
      updated_at: new Date().toISOString()
    })
    .eq('id', documentId)
    .in('organization_id', targetOrgIds); // Ensure org match

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
    await supabase.from('audit_logs').insert({
      actor_id: user.id,
      organization_id: 'organizationId' in orgContext ? orgContext.organizationId : null, // Multi-org support
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
  // Get authenticated user
  const authSupabase = await createSupabaseServerClient();
  const { data: { user }, error: authError } = await authSupabase.auth.getUser();
  if (authError || !user) {
    throw apiError.unauthorized('Authentication required');
  }

  // Get organization context for multi-tenancy
  const orgContext = await getOrganizationContext(user);
  const targetOrgIds = getTargetOrganizationIds(orgContext);

  const { searchParams } = new URL(request.url);
  const documentId = searchParams.get('documentId');

  if (!documentId) {
    throw apiError.badRequest('Document ID required');
  }

  // Get document with metadata (filtered by organization)
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
    .in('organization_id', targetOrgIds) // Multi-org filter
    .single();

  if (docError || !document) {
    throw apiError.notFound('Document not found');
  }

  // Students may only view verification details of their own documents
  if (orgContext.role === 'student' && document.student_id !== user.id) {
    throw apiError.forbidden('You do not have permission to view this document');
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


