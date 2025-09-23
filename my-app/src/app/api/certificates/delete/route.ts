import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient, requireRole } from '../../../../../lib/supabaseServer';

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

    const supabase = await createSupabaseServerClient();

    // For students, verify they own this certificate
    if (auth.role === 'student') {
      const { data: certificate, error: certError } = await supabase
        .from('certificates')
        .select('student_id, file_url')
        .eq('id', certificateId)
        .single();
      
      if (certError || !certificate) {
        return NextResponse.json({ error: 'Certificate not found' }, { status: 404 });
      }
      
      if (certificate.student_id !== auth.user.id) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
      }

      // Delete the file from storage if it exists
      if (certificate.file_url) {
        try {
          const filePath = certificate.file_url.split('/').pop();
          if (filePath) {
            await supabase.storage
              .from(process.env.NEXT_PUBLIC_CERTIFICATES_BUCKET || 'certificates')
              .remove([filePath]);
          }
        } catch (storageError) {
          console.error('Error deleting file from storage:', storageError);
          // Continue with database deletion even if storage deletion fails
        }
      }
    }

    // Delete certificate metadata first (foreign key constraint)
    const { error: metadataError } = await supabase
      .from('certificate_metadata')
      .delete()
      .eq('certificate_id', certificateId);

    if (metadataError) {
      console.error('Error deleting certificate metadata:', metadataError);
    }

    // Delete the certificate
    const { error: deleteError } = await supabase
      .from('certificates')
      .delete()
      .eq('id', certificateId);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'Certificate deleted successfully' });

  } catch (error: any) {
    console.error('Delete certificate error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
