import { NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { withRole, success, apiError, parseAndValidateBody } from '@/lib/api';
import { logger } from '@/lib/logger';

interface DeleteCertificateBody {
  certificateId: string;
}

export const DELETE = withRole(['student', 'admin'], async (req: NextRequest, { user, role }) => {
  const result = await parseAndValidateBody<DeleteCertificateBody>(req, ['certificateId']);
  if (result.error) return result.error;
  
  const { certificateId } = result.data;
  logger.debug('DELETE Request for certificate', { certificateId });

  const supabase = await createSupabaseServerClient();

  // Helper to parse bucket and path from a public URL if possible
  const removePublicFileIfExists = async (publicUrl?: string) => {
    if (!publicUrl) return;
    try {
      let bucket: string | undefined;
      let path: string | undefined;

      const marker = '/object/public/';
      const idx = publicUrl.indexOf(marker);
      if (idx !== -1) {
        const after = publicUrl.substring(idx + marker.length);
        const slashIdx = after.indexOf('/');
        if (slashIdx !== -1) {
          bucket = after.substring(0, slashIdx);
          path = after.substring(slashIdx + 1);
        }
      }

      // Fallback: last path segment only with default bucket
      if (!bucket || !path) {
        bucket = process.env.NEXT_PUBLIC_CERTIFICATES_BUCKET || 'certificates';
        path = publicUrl.split('/').pop();
      }

      if (bucket && path) {
        await supabase.storage.from(bucket).remove([path]);
      }
    } catch (storageError) {
      logger.error('Error deleting file from storage', storageError);
    }
  };

  // First, try treating the id as a certificate id
  const { data: certRecord } = await supabase
    .from('certificates')
    .select('id, student_id, file_url')
    .eq('id', certificateId)
    .maybeSingle();

  if (certRecord) {
    logger.debug('Found in certificates table', { id: certRecord.id });
    // Ownership check for students
    if (role === 'student' && certRecord.student_id !== user.id) {
      throw apiError.forbidden('Access denied');
    }

    await removePublicFileIfExists(certRecord.file_url || undefined);

    // Delete certificate metadata first (foreign key constraint)
    const { error: metadataError } = await supabase
      .from('certificate_metadata')
      .delete()
      .eq('certificate_id', certificateId);
    if (metadataError) {
      logger.error('Error deleting certificate metadata', metadataError);
    }

    const { error: deleteError } = await supabase
      .from('certificates')
      .delete()
      .eq('id', certificateId);
    if (deleteError) {
      logger.error('Failed to delete from certificates', deleteError);
      throw apiError.internal(deleteError.message);
    }

    logger.debug('Deleted from certificates table successfully');
    return success({ success: true }, 'Certificate deleted successfully');
  }

  // If not a certificate, try as a document id (new flow)
  logger.debug('Searching documents table for certificate', { certificateId });
  const { data: docRecord, error: docQueryError } = await supabase
    .from('documents')
    .select('id, student_id, file_url')
    .eq('id', certificateId)
    .maybeSingle();

  if (docQueryError) {
    logger.error('Query error in documents table', docQueryError);
  }

  if (!docRecord) {
    logger.debug('Certificate not found in either table');
    throw apiError.notFound('Certificate not found');
  }

  logger.debug('Found in documents table', { 
    id: docRecord.id, 
    idMatch: certificateId === docRecord.id 
  });

  // Ownership check for students
  if (role === 'student' && docRecord.student_id !== user.id) {
    throw apiError.forbidden('Access denied');
  }

  await removePublicFileIfExists(docRecord.file_url || undefined);

  // Delete document metadata first
  const { error: dmdError } = await supabase
    .from('document_metadata')
    .delete()
    .eq('document_id', certificateId);
  if (dmdError) {
    logger.error('Error deleting document metadata', dmdError);
  }

  // Verify deletion by checking if record exists
  const { data: beforeDelete } = await supabase
    .from('documents')
    .select('id')
    .eq('id', certificateId)
    .maybeSingle();
  logger.debug('Before delete verification', { recordExists: !!beforeDelete });

  const { error: docDeleteError } = await supabase
    .from('documents')
    .delete()
    .eq('id', certificateId);
  
  if (docDeleteError) {
    logger.error('Failed to delete from documents', docDeleteError);
    throw apiError.internal(docDeleteError.message);
  }

  // Verify deletion was successful
  const { data: afterDelete } = await supabase
    .from('documents')
    .select('id')
    .eq('id', certificateId)
    .maybeSingle();
  logger.debug('After delete verification', { recordStillExists: !!afterDelete });

  logger.debug('Deleted from documents table successfully');
  return success({ success: true }, 'Document deleted successfully');
});

