import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClientWithAuth } from '@/lib/supabaseServer';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClientWithAuth(request);
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user role
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    if (!roleData || roleData.role !== 'student') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Get student's certificates
    const { data: certificates, error: certError } = await supabase
      .from('certificates')
      .select('*')
      .eq('student_id', user.id)
      .order('created_at', { ascending: false });

    if (certError) {
      return NextResponse.json({ error: 'Failed to fetch certificates' }, { status: 500 });
    }

    // Get student's documents
    const { data: documents, error: docError } = await supabase
      .from('documents')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (docError) {
      return NextResponse.json({ error: 'Failed to fetch documents' }, { status: 500 });
    }

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        role: roleData.role
      },
      certificates: certificates || [],
      documents: documents || [],
      stats: {
        totalCertificates: certificates?.length || 0,
        totalDocuments: documents?.length || 0,
        pendingApproval: certificates?.filter(c => c.status === 'pending').length || 0,
        approved: certificates?.filter(c => c.status === 'approved').length || 0
      }
    });

  } catch (error) {
    console.error('Student dashboard error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
