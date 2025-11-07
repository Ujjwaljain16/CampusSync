import { withRole, success, apiError, getOrganizationContext, getTargetOrganizationIds } from '@/lib/api';
import { createSupabaseServerClient } from '@/lib/supabaseServer';

export const GET = withRole(['student'], async (_req, { user }) => {
  const supabase = await createSupabaseServerClient();

  // Get organization context for multi-tenancy
  const orgContext = await getOrganizationContext(user);
  const targetOrgIds = getTargetOrganizationIds(orgContext);

  // Get student's certificates (filtered by organization)
  const { data: certificates, error: certError } = await supabase
    .from('certificates')
    .select('*')
    .eq('student_id', user.id)
    .in('organization_id', targetOrgIds)
    .order('created_at', { ascending: false });

  if (certError) {
    console.error('Error fetching certificates:', certError);
    throw apiError.internal('Failed to fetch certificates');
  }

  // Get student's documents (filtered by organization)
  const { data: documents, error: docError } = await supabase
    .from('documents')
    .select('*')
    .eq('user_id', user.id)
    .in('organization_id', targetOrgIds)
    .order('created_at', { ascending: false });

  if (docError) {
    console.error('Error fetching documents:', docError);
    throw apiError.internal('Failed to fetch documents');
  }

  return success({
    user: {
      id: user.id,
      email: user.email,
      role: 'student'
    },
    organizationId: 'organizationId' in orgContext ? orgContext.organizationId : null,
    certificates: certificates || [],
    documents: documents || [],
    stats: {
      totalCertificates: certificates?.length || 0,
      totalDocuments: documents?.length || 0,
      pendingApproval: certificates?.filter((c: { status: string }) => c.status === 'pending').length || 0,
      approved: certificates?.filter((c: { status: string }) => c.status === 'approved').length || 0
    }
  });
});


