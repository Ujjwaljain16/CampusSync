import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient, requireRole } from '@/lib/supabaseServer';

export async function DELETE(req: NextRequest) {
  try {
    const auth = await requireRole(['student', 'admin']);
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.message }, { status: auth.status });
    }

    const { certificateId } = await req.json();
    if (!certificateId) {
      return NextResponse.json({ error: 'Certificate ID is required' }, { status: 400 });
    }

    console.log('🗑️  DELETE Request for ID:', certificateId);

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
        console.error('Error deleting file from storage:', storageError);
      }
    };

    // First, try treating the id as a certificate id
    const { data: certRecord } = await supabase
      .from('certificates')
      .select('id, student_id, file_url')
      .eq('id', certificateId)
      .maybeSingle();

    if (certRecord) {
      console.log('📄 Found in certificates table:', certRecord.id);
      // Ownership check for students
      if (auth.role === 'student' && certRecord.student_id !== auth.user.id) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
      }

      await removePublicFileIfExists(certRecord.file_url || undefined);

      // Delete certificate metadata first (foreign key constraint)
      const { error: metadataError } = await supabase
        .from('certificate_metadata')
        .delete()
        .eq('certificate_id', certificateId);
      if (metadataError) {
        console.error('Error deleting certificate metadata:', metadataError);
      }

      const { error: deleteError } = await supabase
        .from('certificates')
        .delete()
        .eq('id', certificateId);
      if (deleteError) {
        console.error('❌ Failed to delete from certificates:', deleteError);
        return NextResponse.json({ error: deleteError.message }, { status: 500 });
      }

      console.log('✅ Deleted from certificates table');
      return NextResponse.json({ success: true, message: 'Certificate deleted successfully' });
    }

    // If not a certificate, try as a document id (new flow)
    console.log('🔍 Searching documents table for:', certificateId);
    const { data: docRecord, error: docQueryError } = await supabase
      .from('documents')
      .select('id, student_id, file_url')
      .eq('id', certificateId)
      .maybeSingle();

    if (docQueryError) {
      console.error('❌ Query error:', docQueryError);
    }

    if (!docRecord) {
      console.log('❌ Not found in either certificates or documents table');
      return NextResponse.json({ error: 'Certificate not found' }, { status: 404 });
    }

    console.log('📄 Found in documents table:', docRecord.id);
    console.log('🆔 ID Match:', certificateId === docRecord.id ? '✅ MATCH' : '❌ MISMATCH');

    // Ownership check for students
    if (auth.role === 'student' && docRecord.student_id !== auth.user.id) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    await removePublicFileIfExists(docRecord.file_url || undefined);

    // Delete document metadata first
    const { error: dmdError } = await supabase
      .from('document_metadata')
      .delete()
      .eq('document_id', certificateId);
    if (dmdError) {
      console.error('Error deleting document metadata:', dmdError);
    }

    // Verify deletion by checking if record exists
    const { data: beforeDelete } = await supabase
      .from('documents')
      .select('id')
      .eq('id', certificateId)
      .maybeSingle();
    console.log('🔍 Before delete - record exists:', !!beforeDelete);

    const { error: docDeleteError } = await supabase
      .from('documents')
      .delete()
      .eq('id', certificateId);
    
    if (docDeleteError) {
      console.error('❌ Failed to delete from documents:', docDeleteError);
      return NextResponse.json({ error: docDeleteError.message }, { status: 500 });
    }

    // Verify deletion was successful
    const { data: afterDelete } = await supabase
      .from('documents')
      .select('id')
      .eq('id', certificateId)
      .maybeSingle();
    console.log('🔍 After delete - record still exists:', !!afterDelete);

    console.log('✅ Deleted from documents table');
    return NextResponse.json({ success: true, message: 'Document deleted successfully' });

  } catch (error: any) {
    console.error('Delete certificate error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

